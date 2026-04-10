import { Page, Layout, Card, BlockStack, TextField, Button, Badge, Select } from "@shopify/polaris";
import { useState } from "react";
import { Form, useNavigate, useLoaderData, useNavigation, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

import BundleSetupUI from "../components/BundleSetupUI.jsx"; 

// --- BACKEND: FETCH SAVED DATA ---
export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  const bundle = await db.bundle.findUnique({
    where: { id: params.id }
  });
  return { bundle };
};

// --- BACKEND: UPDATE DATA ---
export const action = async ({ request, params }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  
  const bundleName = formData.get("bundleName");
  const bundleConfiguration = formData.get("bundleConfiguration"); 
  const status = formData.get("status"); // <--- Grab the status from the form

  await db.bundle.update({
    where: { id: params.id },
    data: {
      name: bundleName,
      status: status, // <--- Update the status in the DB
      configuration: bundleConfiguration
    }
  });

  return redirect("/app");
};

// --- FRONTEND ---
export default function EditBundle() {
  const { bundle } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  
  // Set the states from the DB
  const [bundleName, setBundleName] = useState(bundle?.name || "Unnamed Bundle"); 
  const [status, setStatus] = useState(bundle?.status || "DRAFT"); // <--- State for Status
  
  // Parse the JSON configuration from the DB to pass to the UI
  const initialConfig = bundle?.configuration ? JSON.parse(bundle.configuration) : null;
  const isSaving = navigation.state === "submitting";

  return (
    <Page 
      title={`Editing: ${bundleName}`}
      backAction={{ content: 'Bundles', onAction: () => navigate('/app') }}
      titleMetadata={<Badge tone={status === "ACTIVE" ? "success" : "attention"}>{status}</Badge>}
    >
      <Form method="post">
        <input type="hidden" name="status" value={status} /> {/* <--- Hidden input for the backend */}
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              
              <Card>
                <BlockStack gap="400">
                  <TextField 
                    label="Bundle Name" 
                    name="bundleName"
                    value={bundleName} 
                    onChange={setBundleName} 
                    autoComplete="off" 
                  />
                </BlockStack>
              </Card>

              {/* INJECT SAVED DATA INTO THE UI COMPONENT */}
              <BundleSetupUI initialData={initialConfig} />

            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              {/* <--- Status Card added to Sidebar ---> */}
              <Card>
                <BlockStack gap="400">
                  <Select
                    label="Status"
                    options={[
                      { label: 'Active', value: 'ACTIVE' },
                      { label: 'Draft', value: 'DRAFT' }
                    ]}
                    value={status}
                    onChange={setStatus}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Button submit variant="primary" size="large" fullWidth loading={isSaving}>
                    {isSaving ? "Updating..." : "Update Bundle"}
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}