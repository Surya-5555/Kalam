import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
  private readonly client: Razorpay;

  constructor(private readonly config: ConfigService) {
    this.client = new Razorpay({
      key_id: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      key_secret: this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
    });
  }

  /**
   * Create a Razorpay order.
   * @param amountInPaise  Amount in the smallest currency unit (paise for INR)
   * @param currency       ISO 4217 code, defaults to "INR"
   * @param receipt        Unique receipt id for your records
   */
  async createOrder(
    amountInPaise: number,
    currency = 'INR',
    receipt: string,
  ): Promise<{ orderId: string; amount: number; currency: string }> {
    const order = await (this.client.orders.create as (opts: object) => Promise<any>)({
      amount: amountInPaise,
      currency,
      receipt,
    });
    return { orderId: order.id as string, amount: order.amount as number, currency: order.currency as string };
  }

  /**
   * Verify Razorpay signature to confirm the payment is genuine.
   * Returns true only when the HMAC-SHA256 digest matches.
   */
  verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): boolean {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const secret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(razorpaySignature, 'hex'),
    );
  }
}
