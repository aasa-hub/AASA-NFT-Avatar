// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockAASA {
    string public name = "Mock AASA";
    string public symbol = "AASA";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}
