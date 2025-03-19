# WCAG Accessibility Checker  
🔍 A system for automated WCAG accessibility testing of websites.  

## 📂 Project Structure  
- **wcag-check-frontend/** → React-based UI for accessibility analysis  
- **wcagPoC/src/functions/wcagCeck.js** → Azure Functions backend for WCAG compliance checks through Playwright & axe-core    

## 🚀 Setup  
1️⃣ **Clone the repository:**  
   ```bash
   git clone https://github.com/PascalHamar/accessibilty-checker-PoC.git
   cd wcagPoC
   ```
2️⃣ **Install dependencies:**
   ```bash
   cd wcag-check-frontend && npm install  
   cd ../ && npm install
   ```
3️⃣ Start the services:
   ```bash
   cd wcag-check-frontend && npm run dev  
   cd ../WCAGPOC && func start
   ```
## ⚙ Technologies
- **Frontend:** React.js (Vite)
- **Backend:** Azure Functions (Node.js)
- **Accessibilty-Testing:** Playwright, axe-core
- **Alt-Text Generation:** Hugging Face API (Model: Salesforce/blip-image-captioning-large), Sharp, axios

## 📌 Features
   ✅ Web-based UI for easy testing & reporting 
   
   ✅ Automated WCAG compliance checks using axe-core
   
   ✅ AI-generated alt-text suggestions for images
   
   ✅ Scalable architecture for cloud deployment
