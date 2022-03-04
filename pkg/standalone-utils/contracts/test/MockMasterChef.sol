// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2015, 2016, 2017 Dapphub

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol";

import "../interfaces/IMasterChef.sol";

contract MockMasterChef is IMasterChef {
    IERC20[] public override lpTokens;

    constructor(IERC20[] memory _lpTokens) {
        lpTokens = _lpTokens;
    }

    function deposit(uint256 pid , uint256 _amount, address) public override {
        lpTokens[pid].transferFrom(msg.sender, address(this), _amount);
    }

    function withdrawAndHarvest(uint256 pid, uint256 _amount, address _to) public override {
        lpTokens[pid].transfer(_to, _amount);
    }
}
