import nodemailer from "nodemailer"
import { ApiError } from "./ApiError.js"

class EmailService {
  constructor() {
    this.transporter = null
    this.initializeTransporter()
  }

  async initializeTransporter() {
    try {
      if (process.env.NODE_ENV === "production") {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        })
      } else {
        const testAccount = await nodemailer.createTestAccount()
        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: process.env.ETHEREAL_USER || testAccount.user,
            pass: process.env.ETHEREAL_PASS || testAccount.pass,
          },
        })
      }

      await this.transporter.verify()
      console.log("✅ Email service initialized successfully")
    } catch (error) {
      console.error("❌ Email service initialization failed:", error)
      throw new ApiError(500, "Email service initialization failed")
    }
  }
  async sendEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || "noreply@platform.com",
        to,
        subject,
        html,
        text,
      }

      const info = await this.transporter.sendMail(mailOptions)

      if (process.env.NODE_ENV !== "production") {
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info))
      }

      return info
    } catch (error) {
      console.error("Email sending failed:", error)
      throw new ApiError(500, "Failed to send email")
    }
  }

  // Email templates
  getWelcomeEmailTemplate(name, verificationLink) {
    return {
      subject: "Welcome to Our Platform!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome ${name}!</h2>
          <p>Thank you for joining our platform. To get started, please verify your email address.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>If you didn't create this account, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This email was sent from our platform. Please do not reply to this email.</p>
        </div>
      `,
      text: `Welcome ${name}! Please verify your email by visiting: ${verificationLink}`,
    }
  }

  getPasswordResetTemplate(name, resetLink) {
    return {
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This email was sent from our platform. Please do not reply to this email.</p>
        </div>
      `,
      text: `Password reset requested for ${name}. Reset your password: ${resetLink}`,
    }
  }

  getOrderConfirmationTemplate(orderDetails) {
    const { orderNumber, customerName, items, total, shippingAddress } = orderDetails

    const itemsHtml = items
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.price}</td>
      </tr>
    `,
      )
      .join("")

    return {
      subject: `Order Confirmation - #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Order Confirmation</h2>
          <p>Hi ${customerName},</p>
          <p>Thank you for your order! Here are the details:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Order #${orderNumber}</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #e9ecef;">
                  <th style="padding: 10px; text-align: left;">Item</th>
                  <th style="padding: 10px; text-align: center;">Qty</th>
                  <th style="padding: 10px; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr style="font-weight: bold;">
                  <td colspan="2" style="padding: 10px; text-align: right;">Total:</td>
                  <td style="padding: 10px; text-align: right;">$${total}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style="margin: 20px 0;">
            <h4>Shipping Address:</h4>
            <p style="margin: 5px 0;">${shippingAddress}</p>
          </div>

          <p>We'll send you another email when your order ships.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This email was sent from our platform. Please do not reply to this email.</p>
        </div>
      `,
      text: `Order confirmation for ${customerName}. Order #${orderNumber}. Total: $${total}`,
    }
  }

  async sendWelcomeEmail(to, name, verificationLink) {
    const template = this.getWelcomeEmailTemplate(name, verificationLink)
    return await this.sendEmail({ to, ...template })
  }

  async sendPasswordResetEmail(to, name, resetLink) {
    const template = this.getPasswordResetTemplate(name, resetLink)
    return await this.sendEmail({ to, ...template })
  }

  async sendOrderConfirmationEmail(to, orderDetails) {
    const template = this.getOrderConfirmationTemplate(orderDetails)
    return await this.sendEmail({ to, ...template })
  }
}

export const emailService = new EmailService()
