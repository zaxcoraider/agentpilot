// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SimpleDCA
/// @notice Standalone on-chain Dollar Cost Averaging plan manager.
///         Plans are registered here; execution is triggered off-chain via
///         OKX OnchainOS DEX swap API when isPlanDue() returns true.
///         Compatible with the same ABI as AutoDCAHook (minus V4 hook callbacks).
contract SimpleDCA {

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

    mapping(bytes32 => DCAPlan) public plans;
    mapping(address => bytes32[]) public ownerPlans;
    uint256 public planCount;

    address public immutable registry;

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

    event DCACancelled(bytes32 indexed planId, address indexed owner);

    constructor(address _registry) {
        registry = _registry;
    }

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
    }

    function cancelPlan(bytes32 planId) external {
        DCAPlan storage plan = plans[planId];
        require(plan.owner == msg.sender, "Not plan owner");
        require(plan.active, "Plan not active");
        plan.active = false;
        emit DCACancelled(planId, msg.sender);
    }

    /// @notice Called by off-chain keeper after executing swap via OKX DEX.
    function markExecuted(bytes32 planId) external {
        DCAPlan storage plan = plans[planId];
        require(plan.owner == msg.sender || msg.sender == owner(), "Not authorized");
        require(plan.active, "Plan not active");
        require(block.timestamp >= plan.lastExecuted + plan.intervalSeconds, "Not due yet");
        plan.lastExecuted = block.timestamp;
        plan.totalExecutions++;
        emit DCAExecuted(planId, plan.owner, plan.amountPerInterval, plan.totalExecutions, block.timestamp);
    }

    function getOwnerPlans(address _owner) external view returns (bytes32[] memory) {
        return ownerPlans[_owner];
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

    address private _owner;
    function owner() public view returns (address) { return _owner; }
}
