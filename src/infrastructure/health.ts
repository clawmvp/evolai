import express from "express";
import { healthLogger as logger } from "./logger.js";
import { sqliteStore } from "../memory/sqlite.store.js";

const PORT = 3847;

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  uptimeHuman: string;
  startTime: string;
  lastHeartbeat: string | null;
  karma: number;
  totalPosts: number;
  totalComments: number;
  activeOpportunities: number;
  version: string;
}

const startTime = new Date();

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

function getHealthStatus(): HealthStatus {
  const memory = sqliteStore.get();
  const uptimeSeconds = (Date.now() - startTime.getTime()) / 1000;

  // Determine health status
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Check if last heartbeat is too old (more than 6 hours)
  if (memory.lastHeartbeat) {
    const lastHeartbeatTime = new Date(memory.lastHeartbeat).getTime();
    const hoursSinceHeartbeat = (Date.now() - lastHeartbeatTime) / (1000 * 60 * 60);
    
    if (hoursSinceHeartbeat > 12) {
      status = "unhealthy";
    } else if (hoursSinceHeartbeat > 6) {
      status = "degraded";
    }
  } else {
    status = "degraded"; // Never had a heartbeat
  }

  return {
    status,
    uptime: Math.floor(uptimeSeconds),
    uptimeHuman: formatUptime(uptimeSeconds),
    startTime: startTime.toISOString(),
    lastHeartbeat: memory.lastHeartbeat,
    karma: memory.karma,
    totalPosts: memory.totalPosts,
    totalComments: memory.totalComments,
    activeOpportunities: sqliteStore.getActiveOpportunities().length,
    version: process.env.npm_package_version || "1.0.0",
  };
}

export function startHealthServer(): void {
  const app = express();

  // Health check endpoint
  app.get("/health", (_req, res) => {
    const healthStatus = getHealthStatus();
    
    const httpStatus = 
      healthStatus.status === "healthy" ? 200 :
      healthStatus.status === "degraded" ? 200 : 503;

    res.status(httpStatus).json(healthStatus);
    
    logger.debug({ 
      status: healthStatus.status,
      uptime: healthStatus.uptimeHuman 
    }, "Health check requested");
  });

  // Liveness probe (just confirms the service is running)
  app.get("/health/live", (_req, res) => {
    res.status(200).json({ alive: true });
  });

  // Readiness probe (confirms the service is ready to accept traffic)
  app.get("/health/ready", (_req, res) => {
    const healthStatus = getHealthStatus();
    
    if (healthStatus.status === "unhealthy") {
      res.status(503).json({ ready: false, reason: "Service unhealthy" });
    } else {
      res.status(200).json({ ready: true });
    }
  });

  // Stats endpoint (more detailed metrics)
  app.get("/stats", (_req, res) => {
    const memory = sqliteStore.get();
    
    res.json({
      agent: {
        name: memory.name,
        karma: memory.karma,
        registeredAt: memory.registeredAt,
      },
      activity: {
        totalPosts: memory.totalPosts,
        totalComments: memory.totalComments,
        totalUpvotes: memory.totalUpvotesGiven,
        lastHeartbeat: memory.lastHeartbeat,
        lastPost: memory.lastPost,
        lastComment: memory.lastComment,
      },
      monetization: {
        servicesOffered: memory.monetization.servicesOffered,
        potentialLeads: memory.monetization.potentialLeads.length,
        activeOpportunities: sqliteStore.getActiveOpportunities().length,
        earnings: memory.monetization.earnings,
      },
      relationships: {
        following: memory.following.length,
        interactedWith: memory.interactedWith.length,
      },
      learning: {
        successfulStrategies: memory.successfulStrategies.length,
        failedStrategies: memory.failedStrategies.length,
      },
    });
  });

  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Health server started on port ${PORT}`);
  });
}

export { getHealthStatus };
