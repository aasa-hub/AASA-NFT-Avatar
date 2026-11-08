// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Authorized Avatars — Base Mainnet NFT v2.1 (2026-10-29)
 *
 * Changes vs the first deploy:
 *  - 5 independent price tiers of 200 each; a tier OPENS when the previous one
 *    reaches 80% sold, but stays mintable until it is fully sold.
 *    => full 1,000 supply stays reachable (the 80% trigger no longer strands
 *       the last 40 of every tier).
 *  - phaseFinished(p) is the redemption gate: true only at 200/200 minted.
 *  - mint(uint8 phase) lets a buyer pick any open, unsold tier.
 */
contract AuthorizedAvatars {
    string public constant name = "Authorized Avatars";
    string public constant symbol = "AAV";

    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant PHASE_COUNT = 5;
    uint256 public constant PER_PHASE = 200;

    uint256[5] public phasePrice = [
        0.0005 ether,
        0.0012 ether,
        0.0029 ether,
        0.0070 ether,
        0.0168 ether
    ];

    uint256[5] public phaseRedeem = [
        115_000 ether,
        276_000 ether,
        667_000 ether,
        1_611_000 ether,
        3_866_000 ether
    ];

    uint16[5] public phaseWeight = [10, 24, 58, 140, 336];

    address public owner;
    address public treasury;
    address public royaltyReceiver;
    string public baseURI;

    uint256 public nextId = 1;
    uint256 public advanceThresholdBps = 8000; // next tier opens at 80% of the previous
    uint16 public royaltyBps = 250;            // 2.5%
    uint256 public phaseOneWalletCap = 20;
    bool public mintingClosed;

    uint256[5] public phaseMinted;             // mints per tier
    uint256 public totalMinted;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => uint256) public phaseOf;
    mapping(uint256 => uint64) public mintedAt;
    mapping(address => uint256) public mintedOfPhaseOne;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Minted(address indexed minter, uint256 indexed tokenId, uint256 indexed phase, uint256 pricePaid);
    event PhaseOpened(uint256 indexed phase);
    event PhaseFinished(uint256 indexed phase);
    event FeeForwarded(address indexed treasury, uint256 amount);
    event FeeForwardFailed(uint256 amount);
    event TreasurySet(address indexed treasury);
    event RoyaltyReceiverSet(address indexed receiver);
    event BaseURISet(string uri);
    event MintingClosed();
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error MintClosed();
    error SoldOut();
    error PhaseNotOpen();
    error PhaseSoldOut();
    error Underpaid();
    error Overpaid();
    error ZeroAddress();
    error WalletCapReached();
    error NonReceiver();
    error NotAuthorized();
    error NotMinted();

    constructor(address treasury_, address royaltyReceiver_, string memory baseURI_) {
        if (treasury_ == address(0) || royaltyReceiver_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        treasury = treasury_;
        royaltyReceiver = royaltyReceiver_;
        baseURI = baseURI_;
        emit PhaseOpened(0);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------- phase logic
    /// @notice tier p is open if it is the first, or the previous tier hit the advance threshold
    function phaseOpen(uint256 p) public view returns (bool) {
        if (p >= PHASE_COUNT) return false;
        if (p == 0) return true;
        uint256 need = (PER_PHASE * advanceThresholdBps) / 10_000;
        return phaseMinted[p - 1] >= need;
    }

    /// @notice tier p is finished (100% minted) — this is the redemption gate
    function phaseFinished(uint256 p) public view returns (bool) {
        return p < PHASE_COUNT && phaseMinted[p] == PER_PHASE;
    }

    function phaseInfo(uint256 p)
        external
        view
        returns (uint256 price, uint256 minted, uint256 remaining, bool open, bool finished, uint256 redeemAmount, uint16 weight)
    {
        if (p >= PHASE_COUNT) return (0, 0, 0, false, false, 0, 0);
        price = phasePrice[p];
        minted = phaseMinted[p];
        remaining = PER_PHASE - minted;
        open = phaseOpen(p);
        finished = phaseFinished(p);
        redeemAmount = phaseRedeem[p];
        weight = phaseWeight[p];
    }

    /// @notice highest tier currently open with supply left (UI convenience)
    function currentPhase() external view returns (uint256) {
        uint256 best = 0;
        for (uint256 p = 0; p < PHASE_COUNT; p++) {
            if (phaseOpen(p) && phaseMinted[p] < PER_PHASE) best = p;
        }
        return best;
    }

    function totalSupply() external view returns (uint256) {
        return totalMinted;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f || id == 0x2a55205a;
    }

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address receiver, uint256 amount) {
        receiver = royaltyReceiver;
        amount = (salePrice * royaltyBps) / 10_000;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (ownerOf[tokenId] == address(0)) revert NotMinted();
        return string.concat(baseURI, _toString(tokenId));
    }

    // ------------------------------------------------------------- mint
    /// @notice mint one avatar from a chosen open tier; fee goes to treasury in the same tx
    function mint(uint256 phase) external payable {
        if (mintingClosed) revert MintClosed();
        if (totalMinted >= MAX_SUPPLY) revert SoldOut();
        if (phase >= PHASE_COUNT) revert PhaseNotOpen();
        if (!phaseOpen(phase)) revert PhaseNotOpen();
        if (phaseMinted[phase] >= PER_PHASE) revert PhaseSoldOut();

        uint256 price = phasePrice[phase];
        if (msg.value < price) revert Underpaid();
        if (msg.value > price) revert Overpaid();

        if (phase == 0) {
            if (mintedOfPhaseOne[msg.sender] >= phaseOneWalletCap) revert WalletCapReached();
            mintedOfPhaseOne[msg.sender] += 1;
        }

        uint256 tokenId = nextId;
        nextId = tokenId + 1;
        phaseMinted[phase] += 1;
        totalMinted += 1;

        ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender] += 1;
        phaseOf[tokenId] = phase;
        mintedAt[tokenId] = uint64(block.timestamp);

        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, phase, price);

        (bool ok, ) = payable(treasury).call{value: price}("");
        if (ok) emit FeeForwarded(treasury, price);
        else emit FeeForwardFailed(price);

        if (phaseMinted[phase] == PER_PHASE) emit PhaseFinished(phase);
        // open the next tier as soon as this one crosses the threshold
        uint256 need = (PER_PHASE * advanceThresholdBps) / 10_000;
        if (phaseMinted[phase] >= need && phase + 1 < PHASE_COUNT && phaseMinted[phase + 1] == 0) {
            emit PhaseOpened(phase + 1);
        }
    }

    /// @notice convenience: mint from the highest open tier with supply left
    function mintCurrent() external payable {
        uint256 best = 0;
        for (uint256 p = 0; p < PHASE_COUNT; p++) {
            if (phaseOpen(p) && phaseMinted[p] < PER_PHASE) best = p;
        }
        this.mint{value: msg.value}(best);
    }

    // ------------------------------------------------------------- admin
    function setAdvanceThresholdBps(uint256 bps) external onlyOwner {
        require(bps > 0 && bps <= 10_000, "bad bps");
        advanceThresholdBps = bps;
    }

    function setPhaseOneWalletCap(uint256 cap) external onlyOwner {
        phaseOneWalletCap = cap;
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasurySet(t);
    }

    function setRoyaltyReceiver(address r) external onlyOwner {
        if (r == address(0)) revert ZeroAddress();
        royaltyReceiver = r;
        emit RoyaltyReceiverSet(r);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
        emit BaseURISet(uri);
    }

    function closeMinting() external onlyOwner {
        mintingClosed = true;
        emit MintingClosed();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ------------------------------------------------------------- ERC-721
    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert NotAuthorized();
        getApproved[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner != from) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != from && !isApprovedForAll[from][msg.sender] && getApproved[tokenId] != msg.sender) {
            revert NotAuthorized();
        }
        delete getApproved[tokenId];
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 ret) {
                if (ret != IERC721Receiver.onERC721Received.selector) revert NonReceiver();
            } catch {
                revert NonReceiver();
            }
        }
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) {
            d -= 1;
            b[d] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }

    receive() external payable {
        (bool ok, ) = payable(treasury).call{value: msg.value}("");
        if (ok) emit FeeForwarded(treasury, msg.value);
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
