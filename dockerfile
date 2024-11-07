# Use the official Node.js image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and yarn.lock, then install dependencies
COPY package.json yarn.lock ./
RUN yarn install

# Copy the entire source code
COPY . .

# Expose the application's port
EXPOSE 3000

# Use yarn to start the app in development mode
CMD ["yarn", "start:dev"]
