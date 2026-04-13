-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('SWAP', 'PAYMENT', 'INVEST', 'DCA_EXECUTE', 'SCAN', 'SEARCH', 'SIGNAL');

-- CreateEnum
CREATE TYPE "DCAPlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'PORTFOLIO_CHANGE', 'DCA_EXECUTED', 'LOW_BALANCE');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'ELITE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'AgentPilot',
    "walletAddress" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "details" TEXT NOT NULL,
    "txHash" TEXT,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onChain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DCAPlan" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "intervalSecs" INTEGER NOT NULL,
    "nextExecution" TIMESTAMP(3) NOT NULL,
    "status" "DCAPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "planIdOnChain" TEXT,
    "totalExecuted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DCAPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "condition" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFired" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "x402PaymentCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

CREATE UNIQUE INDEX "Agent_walletAddress_key" ON "Agent"("walletAddress");
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");
CREATE INDEX "Agent_walletAddress_idx" ON "Agent"("walletAddress");

CREATE INDEX "Action_agentId_idx" ON "Action"("agentId");
CREATE INDEX "Action_createdAt_idx" ON "Action"("createdAt");
CREATE INDEX "Action_type_idx" ON "Action"("type");

CREATE INDEX "DCAPlan_agentId_idx" ON "DCAPlan"("agentId");
CREATE INDEX "DCAPlan_status_nextExecution_idx" ON "DCAPlan"("status", "nextExecution");

CREATE INDEX "Alert_agentId_idx" ON "Alert"("agentId");
CREATE INDEX "Alert_active_idx" ON "Alert"("active");

CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DCAPlan" ADD CONSTRAINT "DCAPlan_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
