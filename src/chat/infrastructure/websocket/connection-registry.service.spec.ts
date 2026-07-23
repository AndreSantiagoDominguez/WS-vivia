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

  it('excludes every connection of excludeUserId, not just one', () => {
    const senderDeviceA = buildFakeClient('user-1');
    const senderDeviceB = buildFakeClient('user-1');
    const other = buildFakeClient('user-2');
    registry.addToConversation('conv-1', senderDeviceA);
    registry.addToConversation('conv-1', senderDeviceB);
    registry.addToConversation('conv-1', other);

    registry.broadcastToConversation(
      'conv-1',
      { event: 'typing', payload: {} },
      'user-1',
    );

    expect(senderDeviceA.send).not.toHaveBeenCalled();
    expect(senderDeviceB.send).not.toHaveBeenCalled();
    expect(other.send).toHaveBeenCalledTimes(1);
  });

  it('sendToUser reaches every device of that user and no one else', () => {
    registry.registerConnection(buildFakeClient('user-1'));
    const deviceA = [...registry.getAllClients()][0];
    const deviceB = buildFakeClient('user-1');
    registry.registerConnection(deviceB);
    const other = buildFakeClient('user-2');
    registry.registerConnection(other);

    registry.sendToUser('user-1', { event: 'newMessage', payload: {} });

    expect(deviceA.send).toHaveBeenCalledTimes(1);
    expect(deviceB.send).toHaveBeenCalledTimes(1);
    expect(other.send).not.toHaveBeenCalled();
  });

  it('isUserInConversation: true only for a user actually joined to that conversation, even if online elsewhere', () => {
    const joined = buildFakeClient('user-1');
    registry.registerConnection(joined);
    registry.addToConversation('conv-1', joined);

    // user-2 está online (tiene WS) pero nunca se unió a conv-1.
    const onlineButNotJoined = buildFakeClient('user-2');
    registry.registerConnection(onlineButNotJoined);

    expect(registry.isUserInConversation('conv-1', 'user-1')).toBe(true);
    expect(registry.isUserOnline('user-2')).toBe(true);
    expect(registry.isUserInConversation('conv-1', 'user-2')).toBe(false);
    expect(registry.isUserInConversation('conv-1', 'unknown-user')).toBe(false);
    expect(registry.isUserInConversation('conv-missing', 'user-1')).toBe(false);
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
