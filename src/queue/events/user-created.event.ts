export interface UserCreatedEvent {
  userId: string;
  tenantId: string;
  email: string;
  occurredAt: string;
}

export const USER_CREATED_ROUTING_KEY = 'user.created';
