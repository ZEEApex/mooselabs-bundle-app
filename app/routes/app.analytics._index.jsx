import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { Page, Card, BlockStack, InlineStack, Text, Button, DataTable, Badge, Select, Box, InlineGrid } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  // Sort bundles so ACTIVE ones are checked first (prevents DRAFT duplicates from stealing stats)
  const sortedBundles = [...bundles].sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));

  let orders = [];
  try {
    // FIX 1: Fetch paginated orders so high-volume stores don't cut off Friday's orders!
    let fetchUrl = `https://${session.shop}/admin/api/2024-04/orders.json?status=any&limit=250&created_at_min=${cutoffDate.toISOString()}`;
    
    let pages = 0;
    while (fetchUrl && pages < 5) { // up to 1250 orders max to stay fast
      const response = await fetch(fetchUrl, {
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json"
        }
      });
      const json = await response.json();
      if (json.orders) orders = orders.concat(json.orders);
      
      const linkHeader = response.headers.get("Link");
      fetchUrl = null;
      if (linkHeader) {
        const links = linkHeader.split(",");
        const nextLink = links.find(link => link.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/<([^>]+)>/);
          if (match) fetchUrl = match[1];
        }
      }
      pages++;
    }
  } catch(e) { 
    console.error("Orders fetch crashed:", e); 
  }

  // Initialize stats
  const bundleStats = sortedBundles.map(b => ({
    id: b.id,
    name: b.name,
    nameKey: b.name.trim().toLowerCase(),
    status: b.status,
    parentVariantId: b.parentVariantId,
    orders: 0,
    revenue: 0,
    orderIds: new Set()
  }));

  let totalRevenue = 0;
  let totalOrders = 0;
  const processedOrders = new Set();

  orders.forEach(order => {
    if (!order.line_items) return;

    order.line_items.forEach(item => {
      let props = item.properties || [];
      if (typeof props === 'object' && !Array.isArray(props)) {
        props = Object.keys(props).map(k => ({ name: k, value: props[k] }));
      }

      let matchedStats = null;
      const itemTitle = String(item.title || '').toLowerCase();
      const itemName = String(item.name || '').toLowerCase();
      const itemVarId = String(item.variant_id || item.variant?.id || item.merchandise?.id || '');

      for (const bs of bundleStats) {
        let isMatch = false;

        // 1. Title/Name Match
        if (itemTitle.includes(bs.nameKey) || itemName.includes(bs.nameKey)) {
          isMatch = true;
        }
        
        // 2. Variant ID Match
        if (!isMatch && bs.parentVariantId && itemVarId) {
          const numParentId = String(bs.parentVariantId).split('/').pop();
          if (itemVarId === numParentId) isMatch = true;
        }

        // 3. Properties Match (Aggressive fallback)
        if (!isMatch && Array.isArray(props)) {
          for (const p of props) {
            const pVal = String(p.value || '').toLowerCase();
            if (pVal === bs.nameKey || pVal.includes(bs.nameKey)) {
              isMatch = true;
              break;
            }
          }
        }

        if (isMatch) {
          matchedStats = bs;
          break; // Found the active bundle! Stop looking.
        }
      }

      // Apply stats
      if (matchedStats) {
        const itemPrice = parseFloat(item.price || 0) * parseInt(item.quantity || 1);
        
        if (!matchedStats.orderIds.has(order.id)) {
          matchedStats.orderIds.add(order.id);
          matchedStats.orders += 1;
        }
        matchedStats.revenue += itemPrice;

        if (!processedOrders.has(order.id)) {
          processedOrders.add(order.id);
          totalRevenue += parseFloat(order.current_total_price || order.total_price || 0);
          totalOrders += 1;
        }
      }
    });
  });

  const totalAOV = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const bundleStatsClean = bundleStats.map(b => ({
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
    <Badge tone={b.status?.toUpperCase() === 'ACTIVE' ? 'success' : 'attention'}>{b.status || 'DRAFT'}</Badge>,
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