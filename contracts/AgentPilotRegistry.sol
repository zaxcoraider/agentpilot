// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentPilotRegistry is Ownable {
    struct ActionLog {
        address agentAddress;
        string actionType;
        string details;
        uint256 timestamp;
    }

    // agent => list of actions
    mapping(address => ActionLog[]) private agentActions;

    event ActionLogged(
        address indexed agentAddress,
        string actionType,
        string details,
        uint256 timestamp
    );

    constructor() Ownable(msg.sender) {}

    function logAction(string calldata actionType, string calldata details) external {
        ActionLog memory log = ActionLog({
            agentAddress: msg.sender,
            actionType: actionType,
            details: details,
            timestamp: block.timestamp
        });

        agentActions[msg.sender].push(log);

        emit ActionLogged(msg.sender, actionType, details, block.timestamp);
    }

    function getActionCount(address agent) external view returns (uint256) {
        return agentActions[agent].length;
    }

    function getRecentActions(address agent, uint256 count)
        external
        view
        returns (ActionLog[] memory)
    {
        ActionLog[] storage all = agentActions[agent];
        uint256 total = all.length;

        if (count > total) {
            count = total;
        }

        ActionLog[] memory result = new ActionLog[](count);
        uint256 start = total - count;

        for (uint256 i = 0; i < count; i++) {
            result[i] = all[start + i];
        }

        return result;
    }

    // Admin: clear all logs for an agent (e.g. abuse/spam)
    function clearAgentLogs(address agent) external onlyOwner {
        delete agentActions[agent];
    }
}
