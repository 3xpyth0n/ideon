#!/bin/bash
set -e

# -----------------------------------------------------------------------------
# Color Definitions
# -----------------------------------------------------------------------------
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Arguments Parsing
# -----------------------------------------------------------------------------
SILENT=false
APP_PORT_ARG=""
APP_URL_ARG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --silent|-y)
            SILENT=true
            shift
            ;;
        --port)
            APP_PORT_ARG="$2"
            shift 2
            ;;
        --url)
            APP_URL_ARG="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
print_banner() {
    echo -e "${BLUE}${BOLD}"
    echo " ██╗██████╗ ███████╗ ██████╗ ███╗   ██╗"
    echo " ██║██╔══██╗██╔════╝██╔═══██╗████╗  ██║"
    echo " ██║██║  ██║█████╗  ██║   ██║██╔██╗ ██║"
    echo " ██║██║  ██║██╔══╝  ██║   ██║██║╚██╗██║"
    echo " ██║██████╔╝███████╗╚██████╔╝██║ ╚████║"
    echo " ╚═╝╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝"
    echo -e "${NC}"
}

check_prerequisites() {
    echo -e "${BOLD}[1/4] Checking prerequisites...${NC}"

    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
        echo -e "Visit: https://docs.docker.com/engine/install/"
        exit 1
    fi
    echo -e "${GREEN}Docker is installed.${NC}"

    if ! docker compose version >/dev/null 2>&1; then
        echo -e "${RED}Docker Compose plugin is not installed.${NC}"
        echo -e "${YELLOW}Note: 'docker compose' (V2) is required.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Docker Compose is installed.${NC}"

    if ! command -v openssl >/dev/null 2>&1; then
        echo -e "${RED}OpenSSL is not installed.${NC}"
        exit 1
    fi
    echo -e "${GREEN}OpenSSL is installed.${NC}"

    if [ ! -f "docker-compose.yml" ]; then
        echo -e "${RED}docker-compose.yml not found in the current directory.${NC}"
        exit 1
    fi

    echo
}

configure_env() {
    local port=$1
    local url=$2
    local env_file="$PROJECT_ROOT/.env"

    cp "$PROJECT_ROOT/env.example" "$env_file"

    # Generate secrets
    SECRET_KEY=$(openssl rand -hex 32)
    DB_PASS=$(openssl rand -base64 32)

    # Update .env file
    sed -i "s|^APP_PORT=.*|APP_PORT=$port|" "$env_file"
    sed -i "s|^APP_URL=.*|APP_URL=$url|" "$env_file"
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET_KEY|" "$env_file"
    sed -i "s|^DB_PASS=.*|DB_PASS=$DB_PASS|" "$env_file"

    echo -e "${GREEN}Configuration complete.${NC}"
    echo -e "${GREEN}Secure keys generated.${NC}"
}

configure_smtp() {
    echo
    echo -e "${YELLOW}SMTP Configuration (Optional)${NC}"
    echo -e "Required for email invitations and magic links."

    read -rp "Do you want to configure SMTP settings now? [y/N]: " configure_smtp
    if [[ "$configure_smtp" =~ ^[Yy]$ ]]; then
        read -rp "SMTP Host: " smtp_host
        read -rp "SMTP Port (default 587): " smtp_port
        smtp_port=${smtp_port:-587}
        read -rp "SMTP User: " smtp_user
        read -rp "SMTP Password: " smtp_pass
        read -rp "From Email: " smtp_from_email
        read -rp "From Name: " smtp_from_name

        sed -i "s|^SMTP_HOST=.*|SMTP_HOST=$smtp_host|" "$env_file"
        sed -i "s|^SMTP_PORT=.*|SMTP_PORT=$smtp_port|" "$env_file"
        sed -i "s|^SMTP_USER=.*|SMTP_USER=$smtp_user|" "$env_file"
        sed -i "s|^SMTP_PASSWORD=.*|SMTP_PASSWORD=$smtp_pass|" "$env_file"
        sed -i "s|^SMTP_FROM_EMAIL=.*|SMTP_FROM_EMAIL=$smtp_from_email|" "$env_file"
        sed -i "s|^SMTP_FROM_NAME=.*|SMTP_FROM_NAME=$smtp_from_name|" "$env_file"

        echo -e "${GREEN}SMTP settings updated.${NC}"
    else
        echo -e "${YELLOW}Skipping SMTP configuration.${NC}"
        echo -e "${YELLOW}Email features will not work until you edit .env manually.${NC}"
    fi
}


# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
if [ "$SILENT" = false ]; then
    clear
    print_banner
    echo -e "${CYAN}Welcome to the Ideon installation wizard!${NC}"
    echo -e "This script will help you set up your environment.${NC}"
    echo
fi

check_prerequisites

PROJECT_ROOT="$(dirname "$(realpath "$0")")"
SHOULD_CONFIGURE=true

# -----------------------------------------------------------------------------
# Step 2: Environment Check
# -----------------------------------------------------------------------------
if [ -f "$PROJECT_ROOT/.env" ]; then
    if [ "$SILENT" = true ]; then
        echo -e "${YELLOW}.env file already exists. Keeping existing file in silent mode.${NC}"
        SHOULD_CONFIGURE=false
    else
        echo -e "${YELLOW}.env file already exists.${NC}"
        read -rp "Do you want to overwrite it? [y/N]: " overwrite
        if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
            echo -e "${CYAN}Keeping existing .env file.${NC}"
            SHOULD_CONFIGURE=false
        fi
    fi
fi

if [ "$SHOULD_CONFIGURE" = true ]; then
    # -----------------------------------------------------------------------------
    # Step 3: Configuration Setup
    # -----------------------------------------------------------------------------
    echo -e "${BOLD}[2/4] Configuration Setup${NC}"

    if [ "$SILENT" = true ]; then
        APP_PORT=${APP_PORT_ARG:-3000}
        DEFAULT_URL="http://localhost:$APP_PORT"
        APP_URL=${APP_URL_ARG:-$DEFAULT_URL}
        echo -e "Using Port: ${CYAN}$APP_PORT${NC}"
        echo -e "Using URL:  ${CYAN}$APP_URL${NC}"
    else
        # 1. Port
        read -rp "Application Port [default: 3000]: " APP_PORT
        APP_PORT=${APP_PORT:-${APP_PORT_ARG:-3000}}

        # 2. App URL
        DEFAULT_URL="http://localhost:$APP_PORT"
        read -rp "Application URL [default: $DEFAULT_URL]: " APP_URL
        APP_URL=${APP_URL:-${APP_URL_ARG:-$DEFAULT_URL}}
    fi

    echo

    # -----------------------------------------------------------------------------
    # Step 4: Environment File Generation
    # -----------------------------------------------------------------------------
    echo -e "${BOLD}[3/4] Generating environment files...${NC}"
    configure_env "$APP_PORT" "$APP_URL"

    if [ "$SILENT" = false ]; then
        configure_smtp
    fi
else
    # Load existing values for summary
    APP_PORT=$(grep "^APP_PORT=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
    APP_URL=$(grep "^APP_URL=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
    if [ "$SILENT" = false ]; then
        echo -e "${CYAN}Skipping configuration.${NC}"
    fi
fi

echo

# -----------------------------------------------------------------------------
# Step 4: Summary & Launch
# -----------------------------------------------------------------------------
echo -e "${BOLD}[4/4] Summary${NC}"
echo -e "----------------------------------------------------------------"
echo -e "Port:       ${CYAN}$APP_PORT${NC}"
echo -e "URL:        ${CYAN}$APP_URL${NC}"
echo -e "----------------------------------------------------------------"
echo

START_CMD="docker compose up -d"

if [ "$SILENT" = true ]; then
    start_choice="y"
else
    echo -ne "${YELLOW}Do you want to start Ideon now? [y/N]: ${NC}"
    read -r start_choice
fi

if [[ "$start_choice" =~ ^[Yy]$ ]]; then
    echo
    echo -e "${CYAN}Launching Ideon...${NC}"
    eval "$START_CMD"

    echo -ne "${YELLOW}Waiting for Ideon to start...${NC}"
    MAX_RETRIES=30
    COUNT=0
    until curl -sSf "$APP_URL/api/health" >/dev/null 2>&1 || [ $COUNT -eq $MAX_RETRIES ]; do
        echo -ne "."
        sleep 2
        ((COUNT++))
    done
    echo

    if [ $COUNT -eq $MAX_RETRIES ]; then
        echo -e "${YELLOW}Ideon is taking longer than expected to start.${NC}"
        echo -e "Check the logs with: ${BOLD}docker compose logs -f ideon-app${NC}"
    else
        echo -e "${GREEN}Ideon is starting!${NC}"
        echo -e "You can access it at: ${BOLD}${CYAN}$APP_URL${NC}"
        echo -e "\n${BOLD}Next Steps:${NC}"
        echo -e "1. Visit the URL above"
        echo -e "2. Create your super-admin account"
        echo -e "3. Start mapping your thoughts!"
    fi
else
    echo
    echo -e "You can start Ideon later using:"
    echo -e "  ${BOLD}${CYAN}$START_CMD${NC}"
fi

echo
