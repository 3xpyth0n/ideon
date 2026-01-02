import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface MagicLinkEmailProps {
  loginUrl: string;
}

export const MagicLinkEmail = ({ loginUrl }: MagicLinkEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Log in to Ideon</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Login Request</Heading>
          <Text style={text}>
            Click the button below to log in to your Ideon account.
          </Text>
          <Section style={btnContainer}>
            <Button style={button} href={loginUrl}>
              Sign in
            </Button>
          </Section>
          <Text style={text}>
            or copy and paste this URL into your browser:{" "}
            <Link href={loginUrl} style={link}>
              {loginUrl}
            </Link>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            If you did not request this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default MagicLinkEmail;

const main = {
  backgroundColor: "#000000",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  color: "#ffffff",
};

const container = {
  backgroundColor: "#000000",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  border: "1px solid #333333",
};

const h1 = {
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "bold",
  textAlign: "center" as const,
  margin: "30px 0",
};

const text = {
  color: "#cccccc",
  fontSize: "16px",
  lineHeight: "26px",
  padding: "0 40px",
};

const btnContainer = {
  textAlign: "center" as const,
  paddingRight: "40px",
  paddingLeft: "40px",
  marginTop: "32px",
  marginBottom: "32px",
};

const button = {
  backgroundColor: "#ffffff",
  borderRadius: "0px",
  color: "#000000",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px",
};

const link = {
  color: "#ffffff",
  textDecoration: "underline",
};

const hr = {
  borderColor: "#333333",
  margin: "20px 0",
};

const footer = {
  color: "#666666",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 40px",
};
