import { ConfigService } from '@nestjs/config';

export interface CommissionRates {
  hostPct: number;
  guestPct: number;
}

export function getCommissionRates(config: ConfigService): CommissionRates {
  return {
    hostPct: (config.get<number>('COMMISSION_HOST_PCT') ?? 5) / 100,
    guestPct: (config.get<number>('COMMISSION_GUEST_PCT') ?? 5) / 100,
  };
}

export function calculatePaymentBreakdown(rentAmount: number, rates: CommissionRates) {
  const guestFee = Math.round(rentAmount * rates.guestPct * 100) / 100;
  const hostFee = Math.round(rentAmount * rates.hostPct * 100) / 100;
  const totalCharge = rentAmount + guestFee;
  const propietarioNet = rentAmount - hostFee;
  const platformTotal = guestFee + hostFee;
  const applicationFeeAmount = platformTotal;

  return {
    totalCharge,
    propietarioNet,
    platformTotal,
    guestFee,
    hostFee,
    applicationFeeAmount,
  };
}
