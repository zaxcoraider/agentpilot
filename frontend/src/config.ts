export const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const XLAYER_CHAIN_ID = 196;
export const XLAYER_TESTNET_CHAIN_ID = 1952;
export const ARB_SEPOLIA_CHAIN_ID = 421614;

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e";

export const DCA_CONTRACT_ADDRESS =
  import.meta.env.VITE_DCA_CONTRACT_ADDRESS ||
  "0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e";

export const DCA_ABI = [
  "function createPlan(address tokenIn, address tokenOut, uint256 amountPerInterval, uint256 intervalSeconds) external returns (bytes32 planId)",
  "function cancelPlan(bytes32 planId) external",
  "function getOwnerPlans(address owner) external view returns (bytes32[])",
  "function isPlanDue(bytes32 planId) external view returns (bool)",
  "function getTimeUntilNext(bytes32 planId) external view returns (uint256)",
  "function plans(bytes32) external view returns (address owner, address tokenIn, address tokenOut, uint256 amountPerInterval, uint256 intervalSeconds, uint256 lastExecuted, uint256 totalExecutions, bool active)",
];

export const REGISTRY_ABI = [
  "function logAction(string calldata actionType, string calldata details) external",
  "function getActionCount(address agent) external view returns (uint256)",
  "function getRecentActions(address agent, uint256 count) external view returns (tuple(address agentAddress, string actionType, string details, uint256 timestamp)[])",
  "event ActionLogged(address indexed agentAddress, string actionType, string details, uint256 timestamp)",
];
