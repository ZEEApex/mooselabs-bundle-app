import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import {
  Page, Layout, Text, Card, Button, BlockStack, InlineStack,
  IndexTable, Badge, Banner, InlineGrid, Popover, ActionList, Spinner
} from "@shopify/polaris";
import { ViewIcon, EditIcon, DeleteIcon, MenuHorizontalIcon, ChartVerticalIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback } from "react";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  const bundles = await db.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  // Check if cart transform is already registered
  let isTransformActive = false;
  let registeredTransformId = null;
  try {
    const res = await admin.graphql(`
      query { cartTransforms(first: 10) { nodes { id functionId } } }
    `);
    const data = await res.json();
    const transforms = data.data?.cartTransforms?.nodes || [];
    if (transforms.length > 0) {
      isTransformActive = true;
      registeredTransformId = transforms[0].id;
    }
  } catch(e) {}

  // Get product handles for copy links
  const bundlesWithHandles = await Promise.all(bundles.map(async (b) => {
    let productHandle = null;
    try {
      const config = JSON.parse(b.configuration || "{}");
      const productGid = config.parentProduct?.id;
      if (productGid) {
        const res = await admin.graphql(`
          query { product(id: "${productGid}") { handle } }
        `);
        const data = await res.json();
        productHandle = data.data?.product?.handle || null;
      }
    } catch(e) {}
    return { ...b, productHandle };
  }));

  return { 
    bundles: bundlesWithHandles, 
    isTransformActive,
    registeredTransformId,
    shop: session.shop 
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "delete") {
    await db.bundle.delete({ where: { id: formData.get("bundleId") } });
    return { success: true, action: "delete" };
  }

  if (actionType === "clone") {
    const original = await db.bundle.findUnique({ where: { id: formData.get("bundleId") } });
    if (original) {
      await db.bundle.create({
        data: {
          shop: session.shop,
          name: `${original.name} (Copy)`,
          status: "DRAFT",
          configuration: original.configuration
        }
      });
    }
    return { success: true, action: "clone" };
  }

  if (actionType === "register_transform") {
    // Auto-discover the function ID from the app's extensions
    let functionId = formData.get("functionId");
    
    // Try to find it automatically via GraphQL
    try {
      const res = await admin.graphql(`
        query {
          shopifyFunctions(first: 25) {
            nodes { id title apiType }
          }
        }
      `);
      const data = await res.json();
      const fn = data.data?.shopifyFunctions?.nodes?.find(
        f => f.apiType === "cart_transform"
      );
      if (fn) functionId = fn.id;
    } catch(e) {}

    const response = await admin.graphql(`
      mutation {
        cartTransformCreate(functionId: "${functionId}") {
          cartTransform { id }
          userErrors { message }
        }
      }
    `);
    const resJson = await response.json();
    const errors = resJson.data?.cartTransformCreate?.userErrors;
    if (errors?.length > 0) {
      if (errors[0].message.includes("already exists")) return { success: true, action: "register" };
      return { error: errors[0].message, action: "register" };
    }
    return { success: true, action: "register" };
  }

  if (actionType === "deregister_transform") {
    const transformId = formData.get("transformId");
    await admin.graphql(`
      mutation { cartTransformDelete(id: "${transformId}") { deletedId userErrors { message } } }
    `);
    return { success: true, action: "deregister" };
  }

  return null;
};

function BundleRow({ bundle, index, onDelete, onClone, shop }) {
  const navigate = useNavigate();
  const [popoverActive, setPopoverActive] = useState(false);
  const togglePopover = useCallback(() => setPopoverActive(a => !a), []);

  const copyLink = () => {
    if (bundle.productHandle) {
      const url = `https://${shop}/products/${bundle.productHandle}`;
      navigator.clipboard.writeText(url).then(() => {
        togglePopover();
        // Could show a toast here
      });
    } else {
      alert("Product handle not found. Make sure a parent product is assigned.");
      togglePopover();
    }
  };

  return (
    <IndexTable.Row id={bundle.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">{bundle.name}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={bundle.status === 'ACTIVE' ? 'success' : 'attention'}>{bundle.status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>Product Page</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="100" wrap={false} blockAlign="center">
          <Button icon={EditIcon} variant="plain" onClick={() => navigate(`/app/edit-bundle/${bundle.id}`)} />
          <Button icon={ViewIcon} variant="plain" onClick={() => {
            if (bundle.productHandle) {
              window.open(`https://${shop}/products/${bundle.productHandle}`, '_blank');
            } else {
              alert("No parent product assigned.");
            }
          }} />
          <Button icon={ChartVerticalIcon} variant="plain" onClick={() => navigate(`/app/analytics/${bundle.id}`)} />
          <Popover
            active={popoverActive}
            activator={<Button icon={MenuHorizontalIcon} variant="plain" onClick={togglePopover} />}
            onClose={togglePopover}
          >
            <ActionList
              actionRole="menuitem"
              items={[
                { content: 'Clone', onAction: () => { togglePopover(); onClone(bundle.id); } },
                { content: 'Copy Storefront Link', onAction: copyLink },
                { content: 'Delete', destructive: true, icon: DeleteIcon, onAction: () => { togglePopover(); onDelete(bundle.id); } },
              ]}
            />
          </Popover>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}

export default function Index() {
  const { bundles, isTransformActive, registeredTransformId, shop } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const submit = useSubmit();

  const activeCount = bundles.filter(b => b.status === 'ACTIVE').length;

  const handleDelete = (id) => {
    if (confirm("Delete this bundle forever?")) {
      submit({ actionType: "delete", bundleId: id }, { method: "post" });
    }
  };

  const handleClone = (id) => {
    submit({ actionType: "clone", bundleId: id }, { method: "post" });
  };

  const handleRegister = () => {
    submit({ actionType: "register_transform", functionId: "" }, { method: "post" });
  };

  const handleDeregister = () => {
    if (confirm("Deactivate the Cart Transform function?")) {
      submit({ actionType: "deregister_transform", transformId: registeredTransformId }, { method: "post" });
    }
  };

  return (
    <Page>
      <BlockStack gap="500">

        {/* HEADER */}
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text variant="headingXl" as="h1">Hey Jason</Text>
            <Text variant="bodyMd" tone="subdued">Welcome to Moose Labs Bundles</Text>
          </BlockStack>
          <InlineStack gap="300">
            <Button onClick={() => navigate('/app/analytics')}>Analytics</Button>
            <Button variant="primary" tone="critical" onClick={() => navigate('/app/create-bundle')}>Create Bundle</Button>
          </InlineStack>
        </InlineStack>

        {/* CART TRANSFORM STATUS */}
        {isTransformActive ? (
          <Banner tone="success" title="Checkout Merge Active">
            <InlineStack gap="300" blockAlign="center">
              <Text>Bundles are merging correctly at checkout.</Text>
              <Button variant="plain" tone="critical" onClick={handleDeregister}>Deactivate</Button>
            </InlineStack>
          </Banner>
        ) : (
          <Banner tone="warning" title="Checkout Setup Required">
            <p>Activate the Cart Transform function to make bundle items merge at checkout.</p>
            <div style={{ marginTop: '10px' }}>
              <Button onClick={handleRegister}>Activate Checkout Merge</Button>
            </div>
          </Banner>
        )}

        {actionData?.action === "clone" && actionData?.success && (
          <Banner tone="success" title="Bundle cloned successfully as DRAFT." />
        )}

        {/* STATS */}
        <Card>
          <InlineGrid columns="1fr 1fr 1fr" gap="400">
            <BlockStack gap="100">
              <Text variant="bodyMd" tone="subdued">Total Bundles</Text>
              <Text variant="headingXl" as="p">{bundles.length}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text variant="bodyMd" tone="subdued">Active Bundles</Text>
              <Text variant="headingXl" as="p">{activeCount}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text variant="bodyMd" tone="subdued">Analytics</Text>
              <Button variant="plain" onClick={() => navigate('/app/analytics')}>View Full Analytics →</Button>
            </BlockStack>
          </InlineGrid>
        </Card>

        {/* TABLE */}
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: 'bundle', plural: 'bundles' }}
            itemCount={bundles.length}
            headings={[
              { title: 'Bundle name' },
              { title: 'Status' },
              { title: 'Type' },
              { title: 'Actions' }
            ]}
            selectable={false}
          >
            {bundles.map((bundle, index) => (
              <BundleRow
                key={bundle.id}
                bundle={bundle}
                index={index}
                onDelete={handleDelete}
                onClone={handleClone}
                shop={shop}
              />
            ))}
          </IndexTable>
        </Card>

      </BlockStack>
    </Page>
  );
}