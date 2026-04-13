// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// NOTE: Uniswap V4 is not yet deployed on X Layer (chainId 196).
// This hook targets Arbitrum Sepolia (421614) where V4 is live.
// PoolManager on Arbitrum Sepolia: 0x360e68faccca8ca495c1b759fd9eee466db9fb32
// When V4 deploys on X Layer, redeploy pointing to the X Layer PoolManager.

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

/// @title AutoDCAHook
/// @notice Uniswap V4 hook for on-chain Dollar Cost Averaging (DCA).
/// @dev Agents register DCA plans. afterSwap emits DCAReady events for keepers.
///      Keepers call executeDCA() which uses PoolManager.unlock to execute the swap.
///      All executions are logged to AgentPilotRegistry on X Layer.
contract AutoDCAHook is BaseHook, IUnlockCallback {

    // ─── Types ───────────────────────────────────────────────────────────────

    struct DCAPlan {
        address owner;
        address tokenIn;
        address tokenOut;
        uint256 amountPerInterval;
        uint256 intervalSeconds;
        uint256 lastExecuted;
        uint256 totalExecutions;
        bool active;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    mapping(bytes32 => DCAPlan) public plans;
    mapping(address => bytes32[]) public ownerPlans;
    uint256 public planCount;

    address public immutable registry;

    // ─── Events ──────────────────────────────────────────────────────────────

    event DCAPlanCreated(
        bytes32 indexed planId,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        uint256 amountPerInterval,
        uint256 intervalSeconds
    );

    event DCAExecuted(
        bytes32 indexed planId,
        address indexed owner,
        uint256 amountIn,
        uint256 executionNumber,
        uint256 timestamp
    );

    event DCAReady(bytes32 indexed planId, address indexed owner, uint256 dueAt);

    event DCACancelled(bytes32 indexed planId, address indexed owner);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(IPoolManager _poolManager, address _registry) BaseHook(_poolManager) {
        registry = _registry;
    }

    // ─── Hook permissions ────────────────────────────────────────────────────

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── Hook callbacks ──────────────────────────────────────────────────────

    /// @dev Override internal _afterSwap as required by BaseHook pattern.
    ///      Emits DCAReady for any active plans that are due (keepers pick these up).
    function _afterSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        // Off-chain keepers index DCAPlanCreated events and poll isPlanDue().
        // On-chain: emit DCAReady for due plans belonging to the swapper (tx.origin).
        bytes32[] storage myPlans = ownerPlans[tx.origin];
        uint256 len = myPlans.length;
        for (uint256 i = 0; i < len && i < 5; i++) {
            bytes32 planId = myPlans[i];
            DCAPlan storage plan = plans[planId];
            if (plan.active && block.timestamp >= plan.lastExecuted + plan.intervalSeconds) {
                emit DCAReady(planId, plan.owner, plan.lastExecuted + plan.intervalSeconds);
            }
        }
        return (BaseHook.afterSwap.selector, 0);
    }

    // ─── DCA Plan Management ─────────────────────────────────────────────────

    /// @notice Register a DCA plan.
    function createPlan(
        address tokenIn,
        address tokenOut,
        uint256 amountPerInterval,
        uint256 intervalSeconds
    ) external returns (bytes32 planId) {
        require(amountPerInterval > 0, "Amount must be > 0");
        require(intervalSeconds >= 60, "Interval must be >= 60s");
        require(tokenIn != tokenOut, "Tokens must differ");
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid token");

        planId = keccak256(
            abi.encodePacked(msg.sender, tokenIn, tokenOut, block.timestamp, planCount++)
        );

        plans[planId] = DCAPlan({
            owner: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountPerInterval: amountPerInterval,
            intervalSeconds: intervalSeconds,
            lastExecuted: block.timestamp,
            totalExecutions: 0,
            active: true
        });

        ownerPlans[msg.sender].push(planId);

        emit DCAPlanCreated(planId, msg.sender, tokenIn, tokenOut, amountPerInterval, intervalSeconds);
        _logToRegistry("invest", string(abi.encodePacked("dca:create:", _toHex(planId))));
    }

    /// @notice Cancel an active DCA plan.
    function cancelPlan(bytes32 planId) external {
        DCAPlan storage plan = plans[planId];
        require(plan.owner == msg.sender, "Not plan owner");
        require(plan.active, "Plan not active");
        plan.active = false;
        emit DCACancelled(planId, msg.sender);
        _logToRegistry("invest", string(abi.encodePacked("dca:cancel:", _toHex(planId))));
    }

    /// @notice Execute a due DCA plan. Permissionless — any keeper can call.
    function executeDCA(bytes32 planId, PoolKey calldata key) external {
        DCAPlan storage plan = plans[planId];
        require(plan.active, "Plan not active");
        require(plan.owner != address(0), "Plan does not exist");
        require(block.timestamp >= plan.lastExecuted + plan.intervalSeconds, "Not due yet");

        // CEI: update state before external call
        plan.lastExecuted = block.timestamp;
        plan.totalExecutions++;

        uint256 execNum = plan.totalExecutions;
        address owner = plan.owner;
        uint256 amount = plan.amountPerInterval;

        // Execute swap via PoolManager unlock pattern
        poolManager.unlock(abi.encode(planId, key));

        emit DCAExecuted(planId, owner, amount, execNum, block.timestamp);
        _logToRegistry("swap", string(abi.encodePacked("dca:execute:", _toHex(planId))));
    }

    /// @notice IUnlockCallback — called by PoolManager to execute the DCA swap.
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        (bytes32 planId, PoolKey memory key) = abi.decode(data, (bytes32, PoolKey));
        DCAPlan storage plan = plans[planId];

        bool zeroForOne = plan.tokenIn == Currency.unwrap(key.currency0);

        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(plan.amountPerInterval),
            sqrtPriceLimitX96: zeroForOne
                ? uint160(4295128740)
                : uint160(1461446703485210103287273052203988822378723970341)
        });

        poolManager.swap(key, params, "");
        return "";
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getOwnerPlans(address owner) external view returns (bytes32[] memory) {
        return ownerPlans[owner];
    }

    function isPlanDue(bytes32 planId) external view returns (bool) {
        DCAPlan storage plan = plans[planId];
        return plan.active && block.timestamp >= plan.lastExecuted + plan.intervalSeconds;
    }

    function getTimeUntilNext(bytes32 planId) external view returns (uint256) {
        DCAPlan storage plan = plans[planId];
        if (!plan.active) return type(uint256).max;
        uint256 nextExec = plan.lastExecuted + plan.intervalSeconds;
        return block.timestamp >= nextExec ? 0 : nextExec - block.timestamp;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _logToRegistry(string memory actionType, string memory details) internal {
        if (registry == address(0)) return;
        (bool success,) = registry.call(
            abi.encodeWithSignature("logAction(string,string)", actionType, details)
        );
        success; // non-critical
    }

    function _toHex(bytes32 b) internal pure returns (string memory) {
        bytes memory s = new bytes(64);
        bytes16 h = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            s[i * 2]     = h[uint8(b[i] >> 4)];
            s[i * 2 + 1] = h[uint8(b[i] & 0x0f)];
        }
        return string(s);
    }
}
