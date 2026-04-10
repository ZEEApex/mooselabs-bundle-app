import { Page, Layout, Card, BlockStack, TextField, Button, Select } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { Form, useNavigate, useNavigation, redirect } from "react-router";
import db from "../db.server";

import BundleSetupUI from "../components/BundleSetupUI.jsx";

// --- BACKEND: THE ACTION THAT CATCHES THE FORM SUBMISSION ---
export const action = async ({ request }) => {
  // 1. Authenticate the user and get their shop URL
  const { session } = await authenticate.admin(request);
  
  // 2. Grab the data from the form
  const formData = await request.formData();
  const bundleName = formData.get("bundleName");
  const bundleConfiguration = formData.get("bundleConfiguration");
  const status = formData.get("status"); // <--- Grab the status from the form

  // 3. Save it to our Prisma Database!
  await db.bundle.create({
    data: {
      shop: session.shop,
      name: bundleName || "Unnamed Bundle",
      status: status || "DRAFT", // <--- Save the selected status
      configuration: bundleConfiguration, 
    }
  });

  // 4. Redirect them back to the main dashboard when done
  return redirect("/app");
};


// --- FRONTEND: THE UI ---
export default function CreateBundle() {
  const [bundleName, setBundleName] = useState("");
  const [status, setStatus] = useState("ACTIVE"); // <--- State for Status
  const navigate = useNavigate();
  const navigation = useNavigation();
  
  const isSaving = navigation.state === "submitting";

  return (
    <Page 
      title="Create New Bundle" 
      backAction={{ content: 'Bundles', onAction: () => navigate('/app') }}
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
                    placeholder="e.g. MouthPeace Micro Bundle"
                  />
                </BlockStack>
              </Card>

              {/* Injects our dynamic UI and the hidden JSON input */}
              <BundleSetupUI />

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
                    {isSaving ? "Saving..." : "Save Bundle"}
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