// SPDX-License-Identifier: GPL-3.0-or-later
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
pragma experimental ABIEncoderV2;

import "../interfaces/IBooMirrorWorld.sol";

import "../LinearPool.sol";

contract BooLinearPool is LinearPool {
    IBooMirrorWorld private immutable _xBOO;

    constructor(
        IVault vault,
        string memory name,
        string memory symbol,
        IERC20 mainToken,
        IERC20 wrappedToken,
        uint256 upperTarget,
        uint256 swapFeePercentage,
        uint256 pauseWindowDuration,
        uint256 bufferPeriodDuration,
        address owner
    )
        LinearPool(
            vault,
            name,
            symbol,
            mainToken,
            wrappedToken,
            upperTarget,
            swapFeePercentage,
            pauseWindowDuration,
            bufferPeriodDuration,
            owner
        )
    {
        _xBOO = IBooMirrorWorld(address(wrappedToken));

        _require(address(mainToken) == address(IBooMirrorWorld(address(wrappedToken)).boo()), Errors.TOKENS_MISMATCH);
    }

    //_getWrappedTokenRate must always return the rate scaled to 18 decimal places
    function _getWrappedTokenRate() internal view override returns (uint256) {
        //the wrappedTokenRate is the amount of BOO received for 1 xBOO
        return _xBOO.xBOOForBOO(1_000_000_000_000_000_000);
    }
}