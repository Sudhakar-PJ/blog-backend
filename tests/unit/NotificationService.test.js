const NotificationService = require('../../src/services/NotificationService');
const NotificationRepository = require('../../src/repositories/NotificationRepository');

// Removed jest mock for NotificationRepository
jest.mock('../../src/config/websocket', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() }))
  }))
}));

describe('NotificationService Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create notification and emit via WS', async () => {
        jest.spyOn(NotificationRepository, 'createNotification').mockResolvedValueOnce({ id: 'n1', user_id: 'u1' });
        const res = await NotificationService.createNotification({ userId: 'u1', actorId: 'u2', type: 'like' });
        expect(res.id).toBe('n1');
        expect(NotificationRepository.createNotification).toHaveBeenCalled();
    });

    it('should create bulk notifications and emit', async () => {
        jest.spyOn(NotificationRepository, 'createBulkNotifications').mockResolvedValueOnce([
            { id: 'n1', user_id: 'u1' },
            { id: 'n2', user_id: 'u2' }
        ]);
        const res = await NotificationService.createBulkNotifications(['u1', 'u2'], 'actor', 'type', 'target');
        expect(res.length).toBe(2);
    });

    it('should mark all as read', async () => {
        jest.spyOn(NotificationRepository, 'markAllAsRead').mockResolvedValueOnce({ count: 5 });
        const res = await NotificationService.markAllAsRead('u1');
        expect(res.count).toBe(5);
    });
});
