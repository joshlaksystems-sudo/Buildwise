import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./NotificationBell.css";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await api("/notifications");
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH", body: JSON.stringify({}) });
      loadNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setLoading(true);
      await api("/notifications/bulk/read-all", { method: "PATCH", body: JSON.stringify({}) });
      loadNotifications();
      setShowDropdown(false);
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setLoading(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "LOW_STOCK":
        return "📦";
      case "OVERDUE_INVOICE":
        return "📋";
      case "PAYMENT_DUE":
        return "💳";
      default:
        return "📬";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "LOW_STOCK":
        return "warning";
      case "OVERDUE_INVOICE":
        return "error";
      case "PAYMENT_DUE":
        return "info";
      default:
        return "default";
    }
  };

  return (
    <div className="notification-bell">
      <button
        className="bell-button"
        onClick={() => setShowDropdown(!showDropdown)}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {showDropdown && (
        <div className="dropdown-menu">
          <div className="dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button
                className="mark-all-btn"
                onClick={handleMarkAllAsRead}
                disabled={loading}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="empty-message">
                <p>No new notifications</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-item ${notif.isRead ? "read" : "unread"} ${getNotificationColor(notif.type)}`}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{notif.title}</div>
                    <div className="notification-message">{notif.message}</div>
                    <div className="notification-time">
                      {new Date(notif.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <button
                      className="close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notif.id);
                      }}
                    >
                      ✓
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="dropdown-footer">
            <button className="view-all-btn">View all notifications</button>
          </div>
        </div>
      )}

      {showDropdown && (
        <div
          className="backdrop"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};
