import { emailService } from "./emailService.js"
import logger from "./logger.js"

class NotificationService {
  constructor() {
    this.channels = {
      EMAIL: "email",
      SMS: "sms",
      PUSH: "push",
      IN_APP: "in_app",
    }

    this.templates = {
      WELCOME: "welcome",
      ORDER_CONFIRMATION: "order_confirmation",
      ORDER_SHIPPED: "order_shipped",
      ORDER_DELIVERED: "order_delivered",
      PASSWORD_RESET: "password_reset",
      EMAIL_VERIFICATION: "email_verification",
      LOW_STOCK: "low_stock",
      NEW_ORDER: "new_order",
      PAYMENT_FAILED: "payment_failed",
    }
  }

  async sendNotification(options) {
    const {
      userId,
      channels = [this.channels.EMAIL],
      template,
      data,
      priority = "normal", // low, normal, high, urgent
    } = options

    try {
      const results = []

      for (const channel of channels) {
        switch (channel) {
          case this.channels.EMAIL:
            const emailResult = await this.sendEmailNotification(template, data)
            results.push({ channel, success: true, result: emailResult })
            break

          case this.channels.SMS:
            const smsResult = await this.sendSMSNotification(template, data)
            results.push({ channel, success: true, result: smsResult })
            break

          case this.channels.PUSH:
            const pushResult = await this.sendPushNotification(template, data)
            results.push({ channel, success: true, result: pushResult })
            break

          case this.channels.IN_APP:
            const inAppResult = await this.sendInAppNotification(userId, template, data)
            results.push({ channel, success: true, result: inAppResult })
            break

          default:
            logger.warn(`Unknown notification channel: ${channel}`)
        }
      }

      logger.info(`Notifications sent for template ${template}:`, results)
      return results
    } catch (error) {
      logger.error("Notification sending failed:", error)
      throw error
    }
  }

  async sendEmailNotification(template, data) {
    try {
      switch (template) {
        case this.templates.WELCOME:
          return await emailService.sendWelcomeEmail(data.email, data.name, data.verificationLink)

        case this.templates.ORDER_CONFIRMATION:
          return await emailService.sendOrderConfirmationEmail(data.email, data.orderDetails)

        case this.templates.PASSWORD_RESET:
          return await emailService.sendPasswordResetEmail(data.email, data.name, data.resetLink)

        case this.templates.ORDER_SHIPPED:
          return await this.sendOrderShippedEmail(data)

        case this.templates.ORDER_DELIVERED:
          return await this.sendOrderDeliveredEmail(data)

        case this.templates.LOW_STOCK:
          return await this.sendLowStockEmail(data)

        case this.templates.NEW_ORDER:
          return await this.sendNewOrderEmail(data)

        default:
          throw new Error(`Unknown email template: ${template}`)
      }
    } catch (error) {
      logger.error(`Email notification failed for template ${template}:`, error)
      throw error
    }
  }

  async sendSMSNotification(template, data) {
    // SMS implementation would go here
    // For now, we'll just log it
    logger.info(`SMS notification would be sent for template ${template}:`, data)
    return { success: true, message: "SMS notification logged" }
  }

  async sendPushNotification(template, data) {
    // Push notification implementation would go here
    // For now, we'll just log it
    logger.info(`Push notification would be sent for template ${template}:`, data)
    return { success: true, message: "Push notification logged" }
  }

  async sendInAppNotification(userId, template, data) {
    // In-app notification implementation would go here
    // This would typically save to database for the user to see in the app
    logger.info(`In-app notification for user ${userId}, template ${template}:`, data)
    return { success: true, message: "In-app notification logged" }
  }

  // Specific email templates
  async sendOrderShippedEmail(data) {
    const { email, customerName, orderNumber, trackingNumber, trackingUrl } = data

    const template = {
      subject: `Your Order #${orderNumber} Has Shipped!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Your Order Has Shipped!</h2>
          <p>Hi ${customerName},</p>
          <p>Great news! Your order #${orderNumber} has been shipped and is on its way to you.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Tracking Information</h3>
            <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
            ${trackingUrl ? `<p><a href="${trackingUrl}" style="color: #007bff;">Track Your Package</a></p>` : ""}
          </div>

          <p>You should receive your order within 3-5 business days.</p>
          <p>Thank you for your business!</p>
        </div>
      `,
      text: `Your order #${orderNumber} has shipped! Tracking: ${trackingNumber}`,
    }

    return await emailService.sendEmail({ to: email, ...template })
  }

  async sendOrderDeliveredEmail(data) {
    const { email, customerName, orderNumber } = data

    const template = {
      subject: `Your Order #${orderNumber} Has Been Delivered!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Order Delivered Successfully!</h2>
          <p>Hi ${customerName},</p>
          <p>Your order #${orderNumber} has been delivered successfully!</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <p>How was your experience? We'd love to hear from you!</p>
            <a href="#" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Leave a Review
            </a>
          </div>

          <p>Thank you for choosing us!</p>
        </div>
      `,
      text: `Your order #${orderNumber} has been delivered! Thank you for your business.`,
    }

    return await emailService.sendEmail({ to: email, ...template })
  }

  async sendLowStockEmail(data) {
    const { email, productName, currentStock, storeOwnerName } = data

    const template = {
      subject: `Low Stock Alert: ${productName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">Low Stock Alert</h2>
          <p>Hi ${storeOwnerName},</p>
          <p>This is an automated alert to inform you that one of your products is running low on stock.</p>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #856404;">Product Details</h3>
            <p><strong>Product:</strong> ${productName}</p>
            <p><strong>Current Stock:</strong> ${currentStock} units</p>
          </div>

          <p>Please consider restocking this item to avoid running out of inventory.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Manage Inventory
            </a>
          </div>
        </div>
      `,
      text: `Low stock alert: ${productName} has only ${currentStock} units remaining.`,
    }

    return await emailService.sendEmail({ to: email, ...template })
  }

  async sendNewOrderEmail(data) {
    const { email, storeOwnerName, orderNumber, customerName, total } = data

    const template = {
      subject: `New Order Received - #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">New Order Received!</h2>
          <p>Hi ${storeOwnerName},</p>
          <p>You have received a new order from your store.</p>
          
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #155724;">Order Details</h3>
            <p><strong>Order Number:</strong> #${orderNumber}</p>
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Total Amount:</strong> $${total}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Order Details
            </a>
          </div>

          <p>Please process this order as soon as possible.</p>
        </div>
      `,
      text: `New order #${orderNumber} from ${customerName}. Total: $${total}`,
    }

    return await emailService.sendEmail({ to: email, ...template })
  }

  // Bulk notification methods
  async sendBulkNotifications(notifications) {
    const results = []

    for (const notification of notifications) {
      try {
        const result = await this.sendNotification(notification)
        results.push({ success: true, result })
      } catch (error) {
        results.push({ success: false, error: error.message })
      }
    }

    return results
  }

  // Scheduled notification methods
  async scheduleNotification(options, scheduleTime) {
    // This would integrate with a job queue like Bull or Agenda
    logger.info(`Notification scheduled for ${scheduleTime}:`, options)
    return { success: true, message: "Notification scheduled" }
  }
}

export const notificationService = new NotificationService()
