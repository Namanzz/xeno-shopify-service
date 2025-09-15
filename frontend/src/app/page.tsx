'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import io from 'socket.io-client'; // Import the socket.io client library

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
  // We've moved it here so it can be called from multiple places.
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

  // NEW: This effect sets up the WebSocket connection for real-time updates.
  useEffect(() => {
    const socket = io(API_BASE_URL);

    socket.on('connect', () => {
      console.log('Connected to WebSocket server!');
    });

    // Listen for the 'data_updated' event from the server
    socket.on('data_updated', () => {
      console.log('Received data_updated event. Re-fetching data.');
      fetchData(); // Re-run the data fetch function
    });

    // Cleanup function to disconnect the socket when the component is no longer on the screen
    return () => {
      socket.disconnect();
    };
  }, []); // The empty array ensures this effect also runs only once.

  // Your custom formatter for the chart tooltip
  const customTooltipFormatter = (value: ValueType, name: NameType, item: any): [string | number, NameType] => {
    if (name === 'Revenue') {
      // Format as Indian Rupees
      return [`₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name];
    }
    if (name === 'Orders') {
      // Return as a plain number
      if (typeof value === 'number' || typeof value === 'string') {
        return [value, name];
      }
      if (Array.isArray(value)) {
        return [value.join(', '), name];
      }
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return [value, name];
    }
    if (Array.isArray(value)) {
      return [value.join(', '), name];
    }
    return [String(value), name];
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