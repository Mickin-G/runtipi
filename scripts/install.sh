#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail

echo "Installing runtipi..."
LATEST_VERSION=$(curl -s https://api.github.com/repos/meienberger/runtipi/releases/latest | grep tag_name | cut -d '"' -f4)

### --------------------------------
### CLI arguments
### --------------------------------
UPDATE="false"
while [ -n "${1-}" ]; do
    case "$1" in
    --update) UPDATE="true" ;;
    --)
        shift # The double dash makes them parameters
        break
        ;;
    *) echo "Option $1 not recognized" && exit 1 ;;
    esac
    shift
done

if [[ "${UPDATE}" == "false" ]]; then
    mkdir -p runtipi
    cd runtipi || exit
fi

curl --location https://api.github.com/repos/meienberger/runtipi/tarball/"${LATEST_VERSION}" -o runtipi.tar.gz
mkdir runtipi-"${LATEST_VERSION}"
tar -xzf runtipi.tar.gz -C runtipi-"${LATEST_VERSION}" --strip-components=1
rm runtipi.tar.gz

# copy from downloaded /scripts/*
if [ -d "scripts" ]; then
    rm -rf scripts
fi
mkdir scripts
cp -r runtipi-"${LATEST_VERSION}"/scripts/* ./scripts

# copy from downloaded /templates/*
if [ -d "templates" ]; then
    rm -rf templates
fi
mkdir templates
cp -r runtipi-"${LATEST_VERSION}"/templates/* ./templates

# copy from downloaded /traefik/*
if [ -d "traefik" ]; then
    rm -rf traefik
fi
mkdir traefik
cp -r runtipi-"${LATEST_VERSION}"/traefik/* ./traefik

# copy from downloaded /docker-compose.yml
if [ -f "docker-compose.yml" ]; then
    rm -f docker-compose.yml
fi
cp -r runtipi-"${LATEST_VERSION}"/docker-compose.yml .

# copy from downloaded /package.json
if [ -f "package.json" ]; then
    rm -f package.json
fi
cp -r runtipi-"${LATEST_VERSION}"/package.json .

mkdir -p state
## remove downloaded folder
rm -rf runtipi-"${LATEST_VERSION}"

sudo ./scripts/start.sh
