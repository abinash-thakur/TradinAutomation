import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('trade_logs')
export class TradeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  strategyId?: string;

  @Column({ length: 50 })
  brokerType: string;

  @Column({ length: 50 })
  symbol: string;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'double precision' })
  price: number;

  @Column({ type: 'double precision' })
  quantity: number;

  @Column({ type: 'double precision', nullable: true })
  pnl?: number;

  @Column({ type: 'text', nullable: true })
  details?: string;

  @CreateDateColumn()
  timestamp: Date;
}
