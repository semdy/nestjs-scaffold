import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { UuidV7Entity } from '../common/entities/uuid-v7.entity';

@Entity({ name: 'tenants' })
export class Tenant extends UuidV7Entity {
  @Index({ unique: true })
  @Column({ length: 120 })
  slug: string;

  @Column({ length: 160 })
  name: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
