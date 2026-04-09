import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key && !key.startsWith('sk_test_your')) {
      this.stripe = new Stripe(key);
    }
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY env var.');
    }
    return this.stripe;
  }

  async createPaymentIntent(
    amount: number,
    metadata: Record<string, string>,
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const intent = await this.getStripe().paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      metadata,
    });
    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      this.config.get<string>('STRIPE_WEBHOOK_SECRET')!,
    );
  }

  async createExpressAccount(
    email: string,
    metadata: Record<string, string>,
  ): Promise<string> {
    const account = await this.getStripe().accounts.create({
      type: 'express',
      country: 'ES',
      email,
      metadata,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    return account.id;
  }

  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.getStripe().accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  async createConnectPaymentIntent(params: {
    amount: number;
    applicationFeeAmount: number;
    destinationAccountId: string;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const intent = await this.getStripe().paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: 'eur',
      application_fee_amount: Math.round(params.applicationFeeAmount * 100),
      transfer_data: {
        destination: params.destinationAccountId,
      },
      metadata: params.metadata,
    });
    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  async getAccount(accountId: string): Promise<Stripe.Account> {
    return this.getStripe().accounts.retrieve(accountId);
  }

  constructConnectWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    return this.getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET')!,
    );
  }
}
