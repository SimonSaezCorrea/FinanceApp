import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { transactions } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { RemoveAttachmentCommand } from "../application/commands/remove-attachment.command";
import { UploadAttachmentCommand } from "../application/commands/upload-attachment.command";
import {
  GetAttachmentUrlQuery,
  ListAttachmentsQuery,
} from "../application/queries/list-attachments.query";
import { AttachmentTypeNotAllowedError } from "../domain/errors";

const transactionParamsSchema = z.object({ id: z.string().min(1) });
const attachmentParamsSchema = z.object({
  id: z.string().min(1),
  attachmentId: z.string().min(1),
});

/** Facade for `/transactions/:id/attachments`. Multipart in, JSON out — the
 *  bytes are never proxied back, the browser fetches them by signed URL. */
@Controller("transactions/:id/attachments")
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transactionParamsSchema)) params: { id: string },
  ): Promise<transactions.Attachment[]> {
    return this.queryBus.execute(new ListAttachmentsQuery(user.id, params.id));
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      // In memory, never on disk: a rejected file must not touch the filesystem.
      limits: { fileSize: transactions.ATTACHMENT_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!transactions.isAllowedAttachmentType(file.mimetype)) {
          cb(new AttachmentTypeNotAllowedError(), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transactionParamsSchema)) params: { id: string },
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ): Promise<transactions.Attachment> {
    if (!file) throw new AttachmentTypeNotAllowedError();
    return this.commandBus.execute(new UploadAttachmentCommand(user.id, params.id, file));
  }

  @Get(":attachmentId/url")
  url(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(attachmentParamsSchema))
    params: { id: string; attachmentId: string },
  ): Promise<transactions.AttachmentUrl> {
    return this.queryBus.execute(
      new GetAttachmentUrlQuery(user.id, params.id, params.attachmentId),
    );
  }

  @Delete(":attachmentId")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(attachmentParamsSchema))
    params: { id: string; attachmentId: string },
  ): Promise<void> {
    return this.commandBus.execute(
      new RemoveAttachmentCommand(user.id, params.id, params.attachmentId),
    );
  }
}
