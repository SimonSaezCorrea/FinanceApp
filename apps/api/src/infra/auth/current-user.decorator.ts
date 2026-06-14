import { type ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  email: string | null;
}

/** Injects the authenticated user (set by JwtAuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) {
      throw new Error("CurrentUser used without JwtAuthGuard");
    }
    return req.user;
  },
);
