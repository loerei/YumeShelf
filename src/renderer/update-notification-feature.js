import { presentBootUpdateNotifications } from './update-notification-presets.js';
import { createUpdateNotificationController } from './update-notifications.js';

function getUpdateNotificationRefs(root) {
    return {
        card: root.getElementById('update-notification-card'),
        dismissBtn: root.getElementById('update-notification-dismiss-btn'),
        eyebrow: root.getElementById('update-notification-eyebrow'),
        handle: root.getElementById('update-notification-handle'),
        host: root.getElementById('update-notification-host'),
        laterBtn: root.getElementById('update-notification-later-btn'),
        message: root.getElementById('update-notification-message'),
        primaryBtn: root.getElementById('update-notification-primary-btn'),
        summary: root.getElementById('update-notification-summary'),
        tertiaryBtn: root.getElementById('update-notification-tertiary-btn'),
        title: root.getElementById('update-notification-title')
    };
}

export function createUpdateNotificationFeature({
    getText,
    openUpdatesReviewModal,
    root = document
}) {
    const updateNotificationController = createUpdateNotificationController({
        refs: getUpdateNotificationRefs(root)
    });

    function presentBootNotifications(bootstrapData) {
        presentBootUpdateNotifications({
            bootstrapData,
            getText,
            openUpdatesReviewModal,
            updateNotificationController
        });
    }

    return {
        clear: () => updateNotificationController.clear(),
        present: (notification) => updateNotificationController.present(notification),
        presentBootNotifications
    };
}
