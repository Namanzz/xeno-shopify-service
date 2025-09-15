import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import crypto from 'crypto';
import cors from 'cors';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Shopify Backend is running');
});
app.get('/version-check', (req, res) => {
  res.send('Backend version 2 is live!');
});

app.post('/api/tenants/sync', async (req, res) => {
  console.log("Sync process started...");
  const shopifyStoreDomain = process.env.SHOPIFY_STORE_DOMAIN!;
  const shopifyAdminAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
  try {
    const tenant = await prisma.tenant.upsert({
      where: { shopifyDomain: shopifyStoreDomain },
      update: { shopifyAccessToken: shopifyAdminAccessToken },
      create: {
        name: "My Shopify Dev Store",
        shopifyDomain: shopifyStoreDomain,
        shopifyAccessToken: shopifyAdminAccessToken,
      },
    });
    const headers = { "X-Shopify-Access-Token": tenant.shopifyAccessToken };
    const productsResponse = await axios.get(`https://${tenant.shopifyDomain}/admin/api/2024-07/products.json`,{ headers });
    for (const product of productsResponse.data.products) {
      await prisma.product.upsert({ where: { shopifyProductId: product.id }, update: { title: product.title, price: parseFloat(product.variants[0].price), }, create: { shopifyProductId: product.id, title: product.title, price: parseFloat(product.variants[0].price), tenantId: tenant.id, }, });
    }
    console.log(`Synced ${productsResponse.data.products.length} products.`);
    const customersResponse = await axios.get(`https://${tenant.shopifyDomain}/admin/api/2024-07/customers.json`, { headers });
    for (const customer of customersResponse.data.customers) {
      await prisma.customer.upsert({ where: { shopifyCustomerId: customer.id }, update: { email: customer.email, firstName: customer.first_name, lastName: customer.last_name, totalSpent: parseFloat(customer.total_spent || "0"), }, create: { shopifyCustomerId: customer.id, email: customer.email, firstName: customer.first_name, lastName: customer.last_name, totalSpent: parseFloat(customer.total_spent || "0"), tenantId: tenant.id, }, });
    }
    console.log(`Synced ${customersResponse.data.customers.length} customers.`);
    const ordersResponse = await axios.get(`https://${tenant.shopifyDomain}/admin/api/2024-07/orders.json?status=any`, { headers });
    for (const order of ordersResponse.data.orders) {
      await prisma.order.upsert({ where: { shopifyOrderId: order.id }, update: { totalPrice: parseFloat(order.total_price), currency: order.currency, shopifyCreatedAt: new Date(order.created_at), }, create: { shopifyOrderId: order.id, totalPrice: parseFloat(order.total_price), currency: order.currency, shopifyCreatedAt: new Date(order.created_at), tenantId: tenant.id, }, });
    }
    console.log(`Synced ${ordersResponse.data.orders.length} orders.`);
    res.status(200).json({ message: "Sync completed successfully!" });
  } catch (error: any) {
    console.error("Sync failed:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Sync failed" });
  }
});

app.get('/api/metrics/overview', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    const totalCustomers = await prisma.customer.count({ where: { tenantId: tenant.id }, });
    const totalOrders = await prisma.order.count({ where: { tenantId: tenant.id }, });
    const totalRevenue = await prisma.order.aggregate({ _sum: { totalPrice: true }, where: { tenantId: tenant.id }, });
    res.json({ totalCustomers, totalOrders, totalRevenue: totalRevenue._sum.totalPrice || 0, });
  } catch(e) { res.status(500).json({error: "Failed to get overview"}); }
});

app.get('/api/metrics/orders-by-date', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    const orders = await prisma.order.findMany({ where: { tenantId: tenant.id }, orderBy: { shopifyCreatedAt: "asc" }, });
    const ordersByDate = orders.reduce((acc, order) => {
      if (!order.shopifyCreatedAt) return acc;
      const date = order.shopifyCreatedAt.toISOString().split("T")[0];
      if (!acc[date]) { acc[date] = { date, orders: 0, revenue: 0 }; }
      acc[date].orders += 1;
      acc[date].revenue += order.totalPrice || 0;
      return acc;
    }, {} as Record<string, { date: string; orders: number; revenue: number }>);
    res.json(Object.values(ordersByDate));
  } catch(e) { res.status(500).json({error: "Failed to get orders by date"}); }
});

app.get('/api/metrics/top-customers', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    const topCustomers = await prisma.customer.findMany({ where: { tenantId: tenant.id }, orderBy: { totalSpent: "desc" }, take: 5, });
    res.json(topCustomers);
  } catch(e) { res.status(500).json({error: "Failed to get top customers"}); }
});

app.post(
  '/api/webhooks/shopify',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const body = req.body;
    const topic = req.get("X-Shopify-Topic");
    const shopDomain = req.get("X-Shopify-Shop-Domain");
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET!;
    const genHash = crypto.createHmac("sha256", secret).update(body).digest("base64");
    if (genHash === hmac) {
      try {
        console.log("✅ Webhook verified successfully!");
        const payload = JSON.parse(body.toString());
        if (topic === "orders/create") {
          const order = payload;
          const tenant = await prisma.tenant.findUnique({ where: { shopifyDomain: shopDomain! }, });
          if (tenant) {
            await prisma.order.upsert({ where: { shopifyOrderId: order.id }, update: { totalPrice: parseFloat(order.total_price), currency: order.currency, shopifyCreatedAt: new Date(order.created_at), }, create: { shopifyOrderId: order.id, totalPrice: parseFloat(order.total_price), currency: order.currency, shopifyCreatedAt: new Date(order.created_at), tenantId: tenant.id, }, });
            console.log(`Processed new order webhook: ${order.id}`);
            io.emit('data_updated');
          }
        }
        res.sendStatus(200);
      } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(500);
      }
    } else {
      console.log("Webhook verification failed.");
      res.sendStatus(403);
    }
  }
);

httpServer.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});