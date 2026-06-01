import { BeforeInsert, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export abstract class UuidV7Entity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @BeforeInsert()
  assignUuidV7(): void {
    this.id ??= uuidv7();
  }
}
