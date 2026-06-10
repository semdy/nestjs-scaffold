import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Channel } from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';

@Injectable()
export class DlqConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DlqConsumerService.name);
  private channel?: Channel;
  private readonly dlqQueue: string;
  private readonly mainQueue: string;
  private readonly exchange?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitmqService: RabbitmqService,
  ) {
    this.mainQueue = this.configService.getOrThrow<string>('RABBITMQ_QUEUE');
    this.dlqQueue = `${this.mainQueue}.dlq`;
    this.exchange = this.configService.get<string>('RABBITMQ_EXCHANGE')?.trim() || undefined;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get<boolean>('RABBITMQ_DLQ_CONSUMER_ENABLED', true)) {
      return;
    }
    await this.initChannel();

    this.rabbitmqService.onReconnect(async () => {
      this.channel = await this.rabbitmqService.createChannel();
      this.logger.log('DLQ channel recreated after reconnection');
    });
  }

  private async initChannel(): Promise<void> {
    this.channel = await this.rabbitmqService.createChannel();
    await this.channel.checkQueue(this.dlqQueue);
    this.logger.log(`DLQ monitor initialized on ${this.dlqQueue}`);
  }

  /** 定时检查 DLQ 深度，有积压就告警 */
  @Cron('0 */1 * * * *') // 每分钟
  async checkDlqDepth(): Promise<void> {
    const info = await this.channel!.checkQueue(this.dlqQueue);
    if (info.messageCount > 0) {
      this.logger.warn(`DLQ has ${info.messageCount} messages pending in ${this.dlqQueue}`);
      // 这里可以接入 Slack / PagerDuty 告警
    }
  }

  /** 重投：从 DLQ 取一条消息，转发到主队列，然后 ack DLQ 消息 */
  async republishOne(): Promise<{ republished: boolean; routingKey?: string }> {
    const msg = await this.channel!.get(this.dlqQueue, { noAck: false });
    if (!msg) {
      return { republished: false };
    }

    const routingKey = msg.fields.routingKey;
    const options = {
      persistent: true,
      contentType: 'application/json',
      headers: { 'x-republish': true },
    };

    if (this.exchange) {
      this.channel!.publish(this.exchange, routingKey, msg.content, options);
    } else {
      this.channel!.sendToQueue(this.mainQueue, msg.content, options);
    }

    // 转发成功后，从 DLQ 中移除
    this.channel!.ack(msg);
    this.logger.log(`Republished DLQ message to main queue, routingKey=${routingKey}`);

    return { republished: true, routingKey };
  }

  /** 批量重投：DLQ 中所有消息 */
  async republishAll(): Promise<number> {
    let count = 0;
    while (true) {
      const { republished } = await this.republishOne();
      if (!republished) break;
      count++;
    }
    return count;
  }
}
