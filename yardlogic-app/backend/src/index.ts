import app from "./app";
import { runNotificationChecksForAllBusinesses, startNotificationScheduler } from "./routes/notifications";
import { runIbimAutomationForAllBusinesses, startIbimAutomationScheduler } from "./services/ibimAutomation";

const port = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(port, () => console.log(`Vyapar+ API listening on :${port}`));
  startNotificationScheduler();
  startIbimAutomationScheduler();
  runNotificationChecksForAllBusinesses().catch((error) => console.error("Initial notification check failed:", error));
  runIbimAutomationForAllBusinesses().catch((error) => console.error("Initial iBIM automation check failed:", error));
}

export default app;
