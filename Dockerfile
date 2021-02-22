FROM node:14.15.5
RUN mkdir -p /home/teknasyon
WORKDIR /home/teknasyon
COPY package.json .
RUN npm install --production
COPY . .
CMD ["npm", "start"]