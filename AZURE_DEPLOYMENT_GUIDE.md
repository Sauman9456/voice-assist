# Azure Web App Deployment Guide for Voice Assistant Flask App

## Deployment Configuration

Your Flask application has been configured for deployment to Azure Web App `new-voice-assistant` with the following specifications:

### Azure Web App Details
- **App Name**: new-voice-assistant
- **URL**: https://new-voice-assistant.azurewebsites.net
- **Resource Group**: Recruitment
- **Location**: East US 2
- **Runtime**: Python 3.10 (Linux)
- **SKU**: Basic

### Files Created/Updated for Deployment

1. **requirements.txt** - Updated with production dependencies:
   - Added `gunicorn==21.2.0` (WSGI server for production)
   - Added `eventlet==0.33.3` (WebSocket support)

2. **startup.txt** - Startup command for Azure:
   ```
   gunicorn --worker-class eventlet --workers 1 --bind 0.0.0.0:8000 --timeout 600 --keep-alive 5 --log-level info app:app
   ```

3. **.deployment** - Build configuration
4. **web.config** - IIS configuration (for Windows compatibility)
5. **azure.yaml** - Azure Developer CLI configuration
6. **.github/workflows/deploy-to-azure.yml** - GitHub Actions workflow

## Deployment Methods

### Method 1: Using Azure Developer CLI (azd)

```bash
# Initialize environment (already done)
azd env new new-voice-assistant

# Set subscription and location
azd env set AZURE_SUBSCRIPTION_ID 26d2057c-beb0-43f0-9509-62c6b118fba0
azd env set AZURE_LOCATION eastus2

# Deploy the application
azd deploy
```

### Method 2: Direct Git Deployment

```bash
# Add Azure remote
git remote add azure https://new-voice-assistant.scm.azurewebsites.net/new-voice-assistant.git

# Push to Azure
git push azure main:master
```

### Method 3: Using Azure CLI (if azd doesn't work)

```bash
# Login to Azure
az login

# Set subscription
az account set --subscription 26d2057c-beb0-43f0-9509-62c6b118fba0

# Configure deployment source
az webapp deployment source config-local-git \
    --name new-voice-assistant \
    --resource-group Recruitment

# Deploy using zip
az webapp deployment source config-zip \
    --resource-group Recruitment \
    --name new-voice-assistant \
    --src app.zip
```

### Method 4: GitHub Actions (Automated)

1. Get the publish profile from Azure Portal:
   - Go to your Web App in Azure Portal
   - Click "Get publish profile"
   - Download the file

2. Add to GitHub Secrets:
   - Go to your GitHub repository
   - Settings → Secrets → New repository secret
   - Name: `AZUREAPPSERVICE_PUBLISHPROFILE`
   - Value: Paste the content of the publish profile

3. Push to main/master branch to trigger deployment

## Environment Variables Configuration

After deployment, configure these environment variables in Azure Portal:

1. Go to your Web App → Configuration → Application settings
2. Add the following settings:

```
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_STORAGE_CONNECTION_STRING=<your-storage-connection-string>
CONTAINER_NAME=new-voice-assist
STORAGE_ACCOUNT_NAME=recruitmentresume
SECRET_KEY=<generate-a-secure-secret-key>
FLASK_ENV=production
SESSIONS_URL=https://new-voice-assist.openai.azure.com/openai/realtimeapi/sessions?api-version=2025-04-01-preview
WEBRTC_URL=https://eastus2.realtimeapi-preview.ai.azure.com/v1/realtimertc
DEPLOYMENT=gpt-realtime
VOICE=alloy
```

## Post-Deployment Verification

1. **Check Application Logs**:
   ```bash
   az webapp log tail --name new-voice-assistant --resource-group Recruitment
   ```

2. **Test the Application**:
   - Visit: https://new-voice-assistant.azurewebsites.net
   - Check if the registration page loads
   - Test the WebSocket connection

3. **Enable Application Insights** (Optional):
   ```bash
   az monitor app-insights component create \
       --app new-voice-assistant-insights \
       --location eastus2 \
       --resource-group Recruitment
   ```

## Troubleshooting

### If deployment fails:

1. **Check logs**:
   ```bash
   az webapp log deployment show --name new-voice-assistant --resource-group Recruitment
   ```

2. **Restart the app**:
   ```bash
   az webapp restart --name new-voice-assistant --resource-group Recruitment
   ```

3. **Check startup command**:
   - Go to Azure Portal → Configuration → General settings
   - Ensure Startup Command is set to: `gunicorn --worker-class eventlet --workers 1 --bind 0.0.0.0:8000 --timeout 600 --keep-alive 5 --log-level info app:app`

4. **Enable detailed error logging**:
   ```bash
   az webapp config set --name new-voice-assistant --resource-group Recruitment --web-sockets-enabled true --always-on true
   ```

### Common Issues:

- **502/503 errors**: Check if all environment variables are set
- **WebSocket issues**: Ensure Web Sockets are enabled in Configuration
- **Module not found**: Verify all dependencies are in requirements.txt
- **Port binding**: Azure expects the app to bind to port 8000

## Manual ZIP Deployment (Alternative)

If automated deployment fails:

1. **Create deployment package**:
   ```bash
   # Windows
   powershell Compress-Archive -Path * -DestinationPath app.zip -Force
   
   # Linux/Mac
   zip -r app.zip . -x "*.git*" -x "*__pycache__*" -x "*.env*" -x "*venv*"
   ```

2. **Deploy using Azure CLI**:
   ```bash
   az webapp deployment source config-zip \
       --resource-group Recruitment \
       --name new-voice-assistant \
       --src app.zip
   ```

## Monitoring

After deployment, monitor your application:

1. **Application Insights** (if configured):
   - Real-time metrics
   - Request tracking
   - Error analysis

2. **Log Stream**:
   - Azure Portal → Your Web App → Log stream
   - View real-time application logs

3. **Metrics**:
   - Azure Portal → Your Web App → Metrics
   - Monitor CPU, Memory, HTTP requests

## Support

For issues specific to:
- **Flask/SocketIO**: Check console logs and WebSocket connection
- **Azure Storage**: Verify connection string and container permissions
- **WebRTC/OpenAI**: Ensure API keys and endpoints are correct

---

**Note**: The deployment may take 5-10 minutes. Check the deployment status in Azure Portal under Deployment Center.
