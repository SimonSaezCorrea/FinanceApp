import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { TransactionModule } from "../transaction/transaction.module";
import { RemoveAttachmentHandler } from "./application/commands/remove-attachment.handler";
import { UploadAttachmentHandler } from "./application/commands/upload-attachment.handler";
import {
  GetAttachmentUrlQueryHandler,
  ListAttachmentsQueryHandler,
} from "./application/queries/list-attachments.handler";
import { AttachmentsController } from "./presentation/attachments.controller";
import { TransactionAttachmentDataModule } from "./transaction-attachment.data.module";

/**
 * Orchestration module for the `transaction-attachment` table. It imports the
 * `transaction` domain only to READ a movement's ownership through that table's
 * own port — it never queries the movements table itself.
 */
@Module({
  imports: [CqrsModule, JwtModule.register({}), TransactionAttachmentDataModule, TransactionModule],
  controllers: [AttachmentsController],
  providers: [
    UploadAttachmentHandler,
    RemoveAttachmentHandler,
    ListAttachmentsQueryHandler,
    GetAttachmentUrlQueryHandler,
    JwtAuthGuard,
  ],
})
export class TransactionAttachmentModule {}
