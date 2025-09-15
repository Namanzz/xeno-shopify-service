'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import io from 'socket.io-client';

// Define types for our data to use with TypeScript
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
  const API_BASE_URL = 'http://localhost:3001';

  // This function fetches all the data for the dashboard.
  const fetchData = async () => {
    try {
      console.log('Fetching updated data...');
      const overviewRes = await fetch(`${API_BASE_URL}/api/metrics/overview`);
      setOverview(await overviewRes.json());

      const ordersRes = await fetch(`${API_BASE_URL}/api/metrics/orders-by-date`);
      setOrdersByDate(await ordersRes.json());
      
      const customersRes = await fetch(`${API_BASE_URL}/api/metrics/top-customers`);
      setTopCustomers(await customersRes.json());
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    }
  };

  // This effect runs only once to load the initial data when the page loads.
  useEffect(() => {
    fetchData();
  }, []);

  // This effect sets up the WebSocket connection for real-time updates.
  useEffect(() => {
    // In a deployed environment, the socket should connect to the same host as the window.
    // This avoids hardcoding the URL. For local dev, we still need the base URL.
    const socketURL = process.env.NODE_ENV === 'production' ? window.location.origin : API_BASE_URL;
    const socket = io(socketURL);

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

  // Corrected custom formatter for the chart tooltip
  const customTooltipFormatter = (value: ValueType, name: NameType): [string, NameType] => {
    if (name === 'Revenue') {
      return [`₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name];
    }
    // All other values (like Orders) are returned as is.
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

// StatCard component with updated styles
const StatCard = ({ title, value }: { title: string; value: string | number }) => (
  <div className="bg-white p-6 rounded-lg shadow">
    <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</h3>
    <p className="text-3xl font-bold mt-2 text-gray-900">{value}</p>
  </div>
);