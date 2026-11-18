import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Banner,
  Text,
  List,
} from "@shopify/polaris";
import { useState } from "react";
import { useLoaderData, useActionData, useNavigation, Form } from "react-router";
import { authenticate } from "../shopify.server";

const FUNCTION_TITLE = "Order discount excluding bundles";
const DEFAULT_COLLECTION_ID = "gid://shopify/Collection/157338763330";

// --- Find the deployed function + check whether a PBF26 code already exists ---
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query PBF26Setup {
      shopifyFunctions(first: 100) {
        nodes { id title apiType }
      }
      codeDiscountNodes(first: 10, query: "code:PBF26") {
        nodes {
          id
          codeDiscount {
            __typename
            ... on DiscountCodeApp { title status }
            ... on DiscountCodeBasic { title status }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const nodes = data?.data?.shopifyFunctions?.nodes ?? [];
  const fn = nodes.find((n) => n.title === FUNCTION_TITLE);

  const existing = (data?.data?.codeDiscountNodes?.nodes ?? []).map((n) => ({
    id: n.id,
    title: n.codeDiscount?.title,
    status: n.codeDiscount?.status,
    type: n.codeDiscount?.__typename,
  }));

  return {
    functionId: fn?.id ?? null,
    existing,
    defaultCollectionId: DEFAULT_COLLECTION_ID,
  };
};

// --- Create the order-level PBF26 app discount with its config metafield ---
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const functionId = formData.get("functionId");
  const collectionId = (formData.get("collectionId") || "").trim();
  const percentage = Number(formData.get("percentage") || 20);

  if (!functionId) {
    return { ok: false, errors: [{ message: "Function not found. Make sure `shopify app deploy` has released the order-discount-excl-bundles function." }] };
  }
  if (!collectionId.startsWith("gid://shopify/Collection/")) {
    return { ok: false, errors: [{ message: "Collection ID must look like gid://shopify/Collection/123..." }] };
  }

  const configValue = JSON.stringify({
    percentage,
    message: `PBF26 — ${percentage}% off`,
    collectionIds: [collectionId],
  });

  const input = {
    title: "PBF26 — 20% off (excl. bundles)",
    code: "PBF26",
    functionId,
    discountClasses: ["ORDER"],
    startsAt: new Date().toISOString(),
    endsAt: "2026-11-30T08:00:00Z",
    appliesOncePerCustomer: false,
    combinesWith: {
      productDiscounts: true,
      orderDiscounts: true,
      shippingDiscounts: false,
    },
    metafields: [
      {
        namespace: "$app:order-discount-excl-bundles",
        key: "function-configuration",
        type: "json",
        value: configValue,
      },
    ],
  };

  const response = await admin.graphql(
    `
    mutation CreatePBF26($input: DiscountCodeAppInput!) {
      discountCodeAppCreate(codeAppDiscount: $input) {
        codeAppDiscount { discountId title status }
        userErrors { field message }
      }
    }
  `,
    { variables: { input } },
  );

  const data = await response.json();
  const result = data?.data?.discountCodeAppCreate;
  const errors = result?.userErrors ?? [];

  if (!result || errors.length > 0 || !result.codeAppDiscount) {
    return {
      ok: false,
      errors: errors.length ? errors : [{ message: "Discount was not created. Check that the old PBF26 code was renamed first (codes must be unique)." }],
    };
  }

  return { ok: true, created: result.codeAppDiscount };
};

export default function CreatePBF26() {
  const { functionId, existing, defaultCollectionId } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [collectionId, setCollectionId] = useState(defaultCollectionId);
  const [percentage, setPercentage] = useState("20");

  const activeConflict = (existing || []).find(
    (d) => (d.status || "").toUpperCase() === "ACTIVE",
  );

  return (
    <Page title="Create PBF26 (order-level, excludes bundles)">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.ok && (
              <Banner tone="success" title="PBF26 created">
                <p>
                  {actionData.created.title} &mdash; status{" "}
                  {actionData.created.status}. Now test it on a cart: tray stays
                  free, 20% off non-bundle items, bundle untouched.
                </p>
              </Banner>
            )}
            {actionData && actionData.ok === false && (
              <Banner tone="critical" title="Could not create PBF26">
                <List>
                  {actionData.errors.map((e, i) => (
                    <List.Item key={i}>{e.message}</List.Item>
                  ))}
                </List>
              </Banner>
            )}

            {!functionId && (
              <Banner tone="warning" title="Function not found yet">
                <p>
                  The <code>order-discount-excl-bundles</code> function isn&apos;t
                  showing up. Run <code>shopify app deploy</code> and reload this
                  page.
                </p>
              </Banner>
            )}

            {activeConflict && (
              <Banner tone="warning" title="An active PBF26 code already exists">
                <p>
                  Rename / deactivate the current <strong>PBF26</strong> (to
                  PBF26-OLD) in Discounts first &mdash; codes must be unique, so
                  creating a second PBF26 will fail until the old one is renamed.
                </p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Configuration
                </Text>
                <Text as="p" tone="subdued">
                  Creates the new order-class PBF26 discount owned by this app,
                  so it stacks with the free-tray product promo and skips
                  bundles. Function:{" "}
                  {functionId ? "found ✓" : "not found"}
                </Text>
                <Form method="post">
                  <input type="hidden" name="functionId" value={functionId || ""} />
                  <BlockStack gap="400">
                    <TextField
                      label="Percentage"
                      name="percentage"
                      type="number"
                      value={percentage}
                      onChange={setPercentage}
                      suffix="%"
                      autoComplete="off"
                    />
                    <TextField
                      label="Eligible collection (Shop Moose Labs)"
                      name="collectionId"
                      value={collectionId}
                      onChange={setCollectionId}
                      helpText="The collection whose products get the discount. Everything else (bundles, Shipping Protection, gift cards) is excluded."
                      autoComplete="off"
                    />
                    <Button submit variant="primary" loading={isSubmitting} disabled={!functionId}>
                      Create PBF26
                    </Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Before you click
                </Text>
                <List type="number">
                  <List.Item>
                    In Discounts, rename the current <strong>PBF26</strong> to{" "}
                    <strong>PBF26-OLD</strong> and deactivate it.
                  </List.Item>
                  <List.Item>Click <strong>Create PBF26</strong> above.</List.Item>
                  <List.Item>
                    Turn off &quot;Combines with order discounts&quot; on Bulk
                    Filters 1&ndash;6.
                  </List.Item>
                  <List.Item>Apply PBF26 to a test cart and verify.</List.Item>
                </List>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
