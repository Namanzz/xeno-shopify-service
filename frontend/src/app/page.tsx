'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import io from 'socket.io-client';
interface Overview {
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
}
interface OrderData {
  date: string;
  orders: number;
  revenue: number;
}
interface CustomerData {
  email: string | null;
  totalSpent: number;
}

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ordersByDate, setOrdersByDate] = useState<OrderData[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerData[]>([]);
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
  // In frontend/src/app/page.tsx
const fetchData = async () => {
  try {
    const overviewURL = `${API_BASE_URL}/api/metrics/overview`;
    console.log("Frontend is requesting:", overviewURL); // <-- ADD THIS
    const overviewRes = await fetch(overviewURL);
    setOverview(await overviewRes.json());

    const ordersURL = `${API_BASE_URL}/api/metrics/orders-by-date`;
    console.log("Frontend is requesting:", ordersURL); // <-- ADD THIS
    const ordersRes = await fetch(ordersURL);
    setOrdersByDate(await ordersRes.json());

    const customersURL = `${API_BASE_URL}/api/metrics/top-customers`;
    console.log("Frontend is requesting:", customersURL); // <-- ADD THIS
    const customersRes = await fetch(customersURL);
    setTopCustomers(await customersRes.json());
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
  }
};

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!API_BASE_URL) return;
    const socket = io(API_BASE_URL);

    socket.on('connect', () => {
      console.log('Connected to WebSocket server!');
    });

    socket.on('data_updated', () => {
      console.log('Received data_updated event. Re-fetching data.');
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const customTooltipFormatter = (value: ValueType, name: NameType): [string, NameType] => {
    if (name === 'Revenue') {
      return [`₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name];
    }
    return [`${value}`, name];
  };

  return (
    <main className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">Shopify Insights Dashboard</h1>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Total Revenue" value={`₹${(overview?.totalRevenue ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <StatCard title="Total Orders" value={overview?.totalOrders ?? '0'} />
        <StatCard title="Total Customers" value={overview?.totalCustomers ?? '0'} />
      </div>

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Orders per Day</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ordersByDate}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={customTooltipFormatter} />
              <Legend />
              <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
              <Bar dataKey="orders" fill="#82ca9d" name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Top 5 Customers</h2>
          <ul>
            {topCustomers.map((customer, index) => (
              <li key={index} className="flex justify-between border-b py-2 text-sm">
                <span className="text-gray-600">{customer.email ?? 'N/A'}</span>
                <span className="font-semibold text-gray-800">₹{customer.totalSpent.toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

const StatCard = ({ title, value }: { title: string; value: string | number }) => (
  <div className="bg-white p-6 rounded-lg shadow">
    <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</h3>
    <p className="text-3xl font-bold mt-2 text-gray-900">{value}</p>
  </div>
);