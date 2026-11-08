// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IAvatarNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function phaseOf(uint256 tokenId) external view returns (uint256);
}

/**
 * AvatarRedeemer v3 — instant, one-time AASA redemption.
 *
 * Rules enforced on-chain:
 *  1. INSTANT: no phase gate, no delay. A token is redeemable the moment it is minted.
 *  2. HOLDER-ONLY: the caller must currently own the token (ownerOf == msg.sender),
 *     so holding it in the connected wallet is required.
 *  3. ONE-TIME PER NFT: redeemed[tokenId] is permanent and survives transfers, so a
 *     token can never pay out twice — not by the minter, not by a later buyer.
 *  4. The NFT is NOT burned: it stays transferable on secondary marketplaces and
 *     stakeable later. An unredeemed token carries its redemption right to the buyer.
 *  5. The AASA pool is one-way: `rescue` explicitly cannot touch AASA, so the owner
 *     can never pull the pool out — AASA leaves only through redeem().
 */
contract AvatarRedeemer {
    IAvatarNFT public immutable nft;
    IERC20 public immutable aasa;
    address public owner;

    uint256[5] public phaseRedeem = [
        115_000 ether,
        276_000 ether,
        667_000 ether,
        1_611_000 ether,
        3_866_000 ether
    ];

    mapping(uint256 => bool) public redeemed;
    uint256 public totalRedeemed;
    uint256 public redeemCount;
    bool public paused;

    event Redeemed(address indexed holder, uint256 indexed tokenId, uint256 indexed phase, uint256 amount);
    event PausedSet(bool paused);
    event OwnerTransferred(address indexed from, address indexed to);
    event Rescued(address indexed token, address indexed to, uint256 amount);
    event Funded(address indexed from, uint256 amount);

    error AlreadyRedeemed();
    error NotTokenOwner();
    error Paused();
    error InsufficientPool();
    error NotOwner();
    error UnknownToken();

    constructor(address nft_, address aasa_) {
        nft = IAvatarNFT(nft_);
        aasa = IERC20(aasa_);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function amountForPhase(uint256 phase) public view returns (uint256) {
        if (phase >= 5) revert UnknownToken();
        return phaseRedeem[phase];
    }

    /// @notice redeemable right now if not already redeemed (no phase gate)
    function isRedeemable(uint256 tokenId) external view returns (bool) {
        return !redeemed[tokenId];
    }

    /// @notice amount this token would pay its holder (0 once redeemed)
    function claimable(uint256 tokenId) external view returns (uint256) {
        if (redeemed[tokenId]) return 0;
        return amountForPhase(nft.phaseOf(tokenId));
    }

    function poolBalance() external view returns (uint256) {
        return aasa.balanceOf(address(this));
    }

    /// @notice instant one-time redemption to the current holder
    function redeem(uint256 tokenId) external {
        if (paused) revert Paused();
        if (redeemed[tokenId]) revert AlreadyRedeemed();
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        uint256 phase = nft.phaseOf(tokenId);
        uint256 amount = amountForPhase(phase);
        if (aasa.balanceOf(address(this)) < amount) revert InsufficientPool();

        redeemed[tokenId] = true;
        totalRedeemed += amount;
        redeemCount += 1;

        if (!aasa.transfer(msg.sender, amount)) revert InsufficientPool();
        emit Redeemed(msg.sender, tokenId, phase, amount);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    /// @notice recover non-AASA tokens sent here by mistake; AASA itself is untouchable
    function rescue(address token, address to) external onlyOwner {
        require(token != address(aasa) && to != address(0), "no");
        uint256 b = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, b);
        emit Rescued(token, to, b);
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "zero");
        emit OwnerTransferred(owner, next);
        owner = next;
    }
}
