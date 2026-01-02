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

interface InviteEmailProps {
  inviteLink: string;
  senderName?: string;
}

export const InviteEmail = ({
  inviteLink,
  senderName = "Ideon Team",
}: InviteEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>You have been invited to join Ideon</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Join Ideon</Heading>
          <Text style={text}>Hello,</Text>
          <Text style={text}>
            You have been invited by {senderName} to join Ideon, the platform
            for your ideas.
          </Text>
          <Section style={btnContainer}>
            <Button style={button} href={inviteLink}>
              Accept Invitation
            </Button>
          </Section>
          <Text style={text}>
            or copy and paste this URL into your browser:{" "}
            <Link href={inviteLink} style={link}>
              {inviteLink}
            </Link>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            This invitation was intended for you. If you were not expecting this
            invitation, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default InviteEmail;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  textAlign: "center" as const,
  margin: "30px 0",
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  padding: "0 40px",
};

const btnContainer = {
  textAlign: "center" as const,
  paddingRight: "40px",
  paddingLeft: "40px",
};

const button = {
  backgroundColor: "#000",
  borderRadius: "3px",
  color: "#fff",
  fontSize: "16px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px",
};

const link = {
  color: "#000",
  textDecoration: "underline",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 40px",
};
