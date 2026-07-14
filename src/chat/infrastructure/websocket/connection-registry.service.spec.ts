import { AuthenticatedWebSocket } from '../auth/authenticated-websocket';
import { ConnectionRegistryService } from './connection-registry.service';

function buildFakeClient(userId: string): AuthenticatedWebSocket {
  return {
    userId,
    role: 'ROLE_LESSEE',
    isAlive: true,
    readyState: 1,
    OPEN: 1,
    send: jest.fn(),
  } as unknown as AuthenticatedWebSocket;
}

describe('ConnectionRegistryService', () => {
  let registry: ConnectionRegistryService;

  beforeEach(() => {
    registry = new ConnectionRegistryService();
  });

  it('tracks presence once a connection is registered', () => {
    const client = buildFakeClient('user-1');
    registry.registerConnection(client);

    expect(registry.isUserOnline('user-1')).toBe(true);
    expect(registry.getAllClients().has(client)).toBe(true);
  });

  it('broadcasts to every client joined to a conversation', () => {
    const clientA = buildFakeClient('user-1');
    const clientB = buildFakeClient('user-2');
    registry.addToConversation('conv-1', clientA);
    registry.addToConversation('conv-1', clientB);

    registry.broadcastToConversation('conv-1', {
      event: 'newMessage',
      payload: {},
    });

    expect(clientA.send).toHaveBeenCalledTimes(1);
    expect(clientB.send).toHaveBeenCalledTimes(1);
  });

  it('excludes the sender when a client is passed as excludeClient', () => {
    const sender = buildFakeClient('user-1');
    const other = buildFakeClient('user-2');
    registry.addToConversation('conv-1', sender);
    registry.addToConversation('conv-1', other);

    registry.broadcastToConversation(
      'conv-1',
      { event: 'typing', payload: {} },
      sender,
    );

    expect(sender.send).not.toHaveBeenCalled();
    expect(other.send).toHaveBeenCalledTimes(1);
  });

  it('stops broadcasting to a client removed from a conversation', () => {
    const client = buildFakeClient('user-1');
    registry.addToConversation('conv-1', client);
    registry.removeFromConversation('conv-1', client);

    registry.broadcastToConversation('conv-1', {
      event: 'typing',
      payload: {},
    });

    expect(client.send).not.toHaveBeenCalled();
  });

  it('removes a client from every conversation and from presence on disconnect', () => {
    const client = buildFakeClient('user-1');
    registry.registerConnection(client);
    registry.addToConversation('conv-1', client);
    registry.addToConversation('conv-2', client);

    registry.removeClient(client);

    expect(registry.isUserOnline('user-1')).toBe(false);
    expect(registry.getAllClients().has(client)).toBe(false);
    registry.broadcastToConversation('conv-1', {
      event: 'typing',
      payload: {},
    });
    registry.broadcastToConversation('conv-2', {
      event: 'typing',
      payload: {},
    });
    expect(client.send).not.toHaveBeenCalled();
  });
});
