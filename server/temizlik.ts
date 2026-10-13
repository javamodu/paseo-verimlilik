// K-0025 (A2-1): agent.closed tek noktadan tum ajan-state haritalarini temizler.
import { ajanTemizle as briefTemizle } from "./brief";
import { ajanTemizle as finishgateTemizle } from "./finishgate";
import { ajanTemizle as kaliteTemizle } from "./kalite";
import { ajanTemizle as kapsamTemizle } from "./kapsam";
import { ajanTemizle as loopguardTemizle } from "./loopguard";
import { ajanTemizle as modlarTemizle } from "./modlar";
import { ajanTemizle as onboardingTemizle } from "./onboarding";
import { ajanTemizle as pitbullTemizle } from "./pitbull";
import { ajanTemizle as telemetryTemizle } from "./telemetry";

export function ajanTemizleHepsi(agentId: string): void {
  briefTemizle(agentId);
  finishgateTemizle(agentId);
  kaliteTemizle(agentId);
  kapsamTemizle(agentId);
  loopguardTemizle(agentId);
  modlarTemizle(agentId);
  onboardingTemizle(agentId);
  pitbullTemizle(agentId);
  telemetryTemizle(agentId);
}
