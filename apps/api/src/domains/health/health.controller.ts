import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok"; service: string } {
    return { status: "ok", service: "finance-api" };
  }
}
