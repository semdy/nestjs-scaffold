export type VerificationCodeChannel = 'email' | 'phone';

export const VERIFICATION_CODE_DELIVERY = Symbol('VERIFICATION_CODE_DELIVERY');

export interface VerificationCodeDeliveryProvider {
  deliver(channel: VerificationCodeChannel, target: string, code: string): Promise<void>;
}
