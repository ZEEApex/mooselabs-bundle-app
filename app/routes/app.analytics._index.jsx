import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { 
  Page, Card, BlockStack, InlineStack, Text, Button, 
  DataTable, Badge, Select, Box, InlineGrid
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  let orders = [];
  try {
    const response = await fetch(`https://${session.shop}/admin/api/2024-01/orders.json?status=any&limit=200`, {
      headers: {
        "X-Shopify-Access-Token": session.accessToken,
        "Content-Type": "application/json"
      }
    });
    const json = await response.json();
    orders = json.orders || [];
  } catch(e) { 
    console.error("Orders fetch crashed:", e); 
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Use an array to store bundle stats to avoid collisions on duplicate names
  const bundleStats = bundles.map(b => ({
    id: b.id,
    name: b.name,
    nameKey: b.name.trim().toLowerCase(),
    status: b.status,
    orders: 0,
    revenue: 0,
    orderIds: new Set()
  }));

  let totalRevenue = 0;
  let totalOrders = 0;
  const processedOrders = new Set();

  orders.forEach(order => {
    const orderDate = new Date(order.created_at);
    if (orderDate < cutoffDate) return;
    if (!order.line_items) return;

    order.line_items.forEach(item => {
      let props = item.properties || [];
      if (typeof props === 'object' && !Array.isArray(props)) {
        props = Object.keys(props).map(k => ({ name: k, value: props[k] }));
      }

      // Look ONLY for _bundleName
      const bundleNameAttr = props.find(p => p.name === "_bundleName" || p.key === "_bundleName");

      if (bundleNameAttr) {
        const bName = String(bundleNameAttr.value).trim().toLowerCase();
        
        // Use the raw line item price since _components is gone
        const itemPrice = parseFloat(item.price || 0) * parseInt(item.quantity || 1);

        const matchedStats = bundleStats.find(bs => bs.nameKey === bName);

        if (matchedStats) {
          if (!matchedStats.orderIds.has(order.id)) {
            matchedStats.orderIds.add(order.id);
            matchedStats.orders += 1;
          }
          matchedStats.revenue += itemPrice;
        }

        if (!processedOrders.has(order.id)) {
          processedOrders.add(order.id);
          totalRevenue += parseFloat(order.current_total_price || order.total_price || 0);
          totalOrders += 1;
        }
          // Additional fallback: check for _bundleId when name not found
          const bundleIdAttr = props.find(p => p.name === "_bundleId" || p.key === "_bundleId");
          if (bundleIdAttr) {
            const bId = String(bundleIdAttr.value).trim();
            const itemPrice = parseFloat(item.price || 0) * parseInt(item.quantity || 1);
            const matchedStats = bundleStats.find(bs => bs.id === bId);
            if (matchedStats) {
              if (!matchedStats.orderIds.has(order.id)) {
                matchedStats.orderIds.add(order.id);
                matchedStats.orders += 1;
              }
              matchedStats.revenue += itemPrice;
            }
          }
      }
    });
  });

  const totalAOV = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const bundleStatsClean = Object.values(bundleStats).map(b => ({
    id: b.id, name: b.name, status: b.status, orders: b.orders, revenue: b.revenue
  })).sort((a, b) => b.revenue - a.revenue);

  return { bundleStats: bundleStatsClean, totals: { revenue: totalRevenue, orders: totalOrders, aov: totalAOV }, days };
};

export default function Analytics() {
  const { bundleStats, totals, days } = useLoaderData();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const maxRevenue = Math.max(...bundleStats.map(b => b.revenue), 1);

  const rows = bundleStats.map(b => [
    <Button variant="plain" onClick={() => navigate(`/app/analytics/${b.id}`)}>{b.name}</Button>,
    <Badge tone={b.status?.toUpperCase() === 'ACTIVE' ? 'success' : 'attention'}>{b.status}</Badge>,
    b.orders,
    `$${b.revenue.toFixed(2)}`,
    b.orders > 0 ? `$${(b.revenue / b.orders).toFixed(2)}` : '-'
  ]);

  return (
    <Page title="Analytics" backAction={{ content: 'Home', onAction: () => navigate('/app') }} primaryAction={
      <Select labelHidden label="Date range" value={String(days)} onChange={(val) => setSearchParams({ days: val })}
        options={[{ label: 'Last 7 Days', value: '7' }, { label: 'Last 30 Days', value: '30' }, { label: 'Last 60 Days', value: '60' }]}
      />
    }>
      <BlockStack gap="500">
        <InlineGrid columns="1fr 1fr 1fr 1fr" gap="400">
          {[
            { label: 'Total Bundle Sales', value: `$${totals.revenue.toFixed(2)}` },
            { label: 'Total Bundle Orders', value: totals.orders },
            { label: 'Total AOV', value: `$${totals.aov.toFixed(2)}` },
            { label: 'Active Bundles', value: bundleStats.filter(b => b.status?.toUpperCase() === 'ACTIVE').length },
          ].map((stat, i) => (
            <Card key={i}>
              <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">{stat.label}</Text>
                <Text variant="headingXl" as="p">{stat.value}</Text>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Bundle Split — Bundle Revenue</Text>
            <BlockStack gap="200">
              {bundleStats.filter(b => b.revenue > 0).map((b, i) => (
                <BlockStack key={i} gap="100">
                  <InlineStack align="space-between">
                    <Button variant="plain" onClick={() => navigate(`/app/analytics/${b.id}`)}>{b.name}</Button>
                    <Text variant="bodyMd">${b.revenue.toFixed(2)}</Text>
                  </InlineStack>
                  <div style={{ background: '#f1f1f1', borderRadius: '4px', height: '28px', width: '100%' }}>
                    <div style={{ background: '#2c6ecb', height: '100%', borderRadius: '4px', width: `${(b.revenue / maxRevenue * 100).toFixed(1)}%`, transition: 'width 0.3s ease' }} />
                  </div>
                </BlockStack>
              ))}
              {bundleStats.filter(b => b.revenue > 0).length === 0 && <Text tone="subdued">No revenue data found.</Text>}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card padding="0">
          <Box padding="400"><Text variant="headingMd" as="h2">All Bundles</Text></Box>
          <DataTable columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric']} headings={['Bundle Name', 'Status', 'No. of Orders', 'Total Bundle Value', 'Bundle AOV']} rows={rows} />
        </Card>
      </BlockStack>
    </Page>
  );
}