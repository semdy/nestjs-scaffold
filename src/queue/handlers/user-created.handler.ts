import { Injectable, Logger } from '@nestjs/common';
import { QueueEnvelope } from '../rabbitmq.service';
import { UserCreatedEvent } from '../events/user-created.event';

@Injectable()
export class UserCreatedHandler {
  private readonly logger = new Logger(UserCreatedHandler.name);

  async handle(message: QueueEnvelope<UserCreatedEvent>): Promise<void> {
    this.logger.log(
      `Handled user.created userId=${message.payload.userId} tenantId=${message.payload.tenantId}`,
    );
  }
}
