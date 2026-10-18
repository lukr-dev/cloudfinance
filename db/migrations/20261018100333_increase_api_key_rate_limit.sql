UPDATE apikey
SET rateLimitMax = 600, requestCount = 0, lastRequest = NULL
WHERE rateLimitMax = 120
  AND rateLimitTimeWindow = 60000
  AND rateLimitEnabled = 1;
--> statement-breakpoint
