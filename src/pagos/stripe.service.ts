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
}
