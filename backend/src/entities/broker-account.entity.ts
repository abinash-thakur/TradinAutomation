import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type BrokerType = 
  | 'delta-india' 
  | 'delta-global' 
  | 'binance' 
  | 'bybit' 
  | 'deribit' 
  | 'zerodha' 
  | 'paper';

@Entity('broker_accounts')
export class BrokerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  brokerType: BrokerType;

  @Column({ type: 'text', nullable: true })
  encryptedApiKey: string;

  @Column({ type: 'text', nullable: true })
  encryptedApiSecret: string;

  @Column({ type: 'text', nullable: true })
  encryptedPassphrase?: string;

  @Column({ default: false })
  isTestnet: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  lastTestStatus?: 'SUCCESS' | 'FAILED' | 'PENDING';

  @Column({ type: 'text', nullable: true })
  lastTestMessage?: string;

  @Column({ type: 'double precision', default: 0 })
  balanceUsd: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
